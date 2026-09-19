import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import { SPL_ACCOUNT_LAYOUT, TokenAccount } from '@raydium-io/raydium-sdk'
import base58 from 'bs58'
import { PRIVATE_KEY } from './constants'
import { connection } from './executor/legacy'
import { execute } from './executor/legacy'
import { readJson, saveNewFile, sleep } from './utils'
import { getSellTxWithJupiter } from './utils/swapOnlyAmm'

const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const TOKEN_PROGRAMS = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]
const WALLET_STAGGER_MS = 500
const PRIORITY_FEE_MICROLAMPORTS = 300_000

async function getAllTokenAccounts(owner: PublicKey): Promise<TokenAccount[]> {
  const accounts: TokenAccount[] = []
  for (const programId of TOKEN_PROGRAMS) {
    const tokenAccounts = await connection.getTokenAccountsByOwner(owner, { programId }, 'confirmed')
    for (const { pubkey, account } of tokenAccounts.value) {
      accounts.push({
        pubkey,
        programId: account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(account.data),
      })
    }
  }
  return accounts
}

async function sellTokenBalance(kp: Keypair, mint: PublicKey, amount: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!amount || amount === '0') return true
    try {
      const sellSwap = await getSellTxWithJupiter(kp, mint, amount)
      if (!sellSwap) {
        throw new Error('Error getting sell tx')
      }
      const txSellSig = await execute(sellSwap.transaction, { lastValidBlockHeight: sellSwap.lastValidBlockHeight }, false)
      if (txSellSig) {
        console.log(`Sold token https://solscan.io/tx/${txSellSig}`)
        return true
      }
    } catch {
      await sleep(1000)
    }
  }
  return false
}

async function buildGatherInstructions(
  kp: Keypair,
  tokenAccounts: TokenAccount[],
): Promise<TransactionInstruction[]> {
  const ixs: TransactionInstruction[] = []
  const destination = mainKp.publicKey

  for (const acc of tokenAccounts) {
    const mint = acc.accountInfo.mint
    const tokenProgram = acc.programId
    const tokenAccount = acc.pubkey
    const tokenBalance = (await connection.getTokenAccountBalance(tokenAccount)).value

    if ((tokenBalance.uiAmount ?? 0) > 0) {
      await sellTokenBalance(kp, mint, tokenBalance.amount)
      await sleep(1000)
    }

    const tokenBalanceAfterSell = (await connection.getTokenAccountBalance(tokenAccount)).value
    if (tokenBalanceAfterSell.amount && tokenBalanceAfterSell.amount !== '0') {
      const baseAta = await getAssociatedTokenAddress(mint, mainKp.publicKey, false, tokenProgram)
      ixs.push(
        createAssociatedTokenAccountIdempotentInstruction(
          mainKp.publicKey,
          baseAta,
          mainKp.publicKey,
          mint,
          tokenProgram,
        ),
      )
      ixs.push(
        createTransferCheckedInstruction(
          tokenAccount,
          mint,
          baseAta,
          kp.publicKey,
          BigInt(tokenBalanceAfterSell.amount),
          tokenBalanceAfterSell.decimals,
          [],
          tokenProgram,
        ),
      )
    }

    ixs.push(createCloseAccountInstruction(tokenAccount, mainKp.publicKey, kp.publicKey, [], tokenProgram))
  }

  const lamportsToTransfer = await connection.getBalance(kp.publicKey, 'confirmed')
  if (lamportsToTransfer > 0) {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey: destination,
        lamports: lamportsToTransfer,
      }),
    )
  }

  return ixs
}

async function processWallet(kp: Keypair, index: number): Promise<void> {
  try {
    await sleep(index * WALLET_STAGGER_MS)

    const tokenAccounts = await getAllTokenAccounts(kp.publicKey)
    const lamportsToTransfer = await connection.getBalance(kp.publicKey, 'confirmed')

    if (lamportsToTransfer > 0) {
      console.log(`Wallet ${index} ${kp.publicKey.toBase58()} SOL: ${(lamportsToTransfer / LAMPORTS_PER_SOL).toFixed(6)}`)
    }

    if (tokenAccounts.length === 0 && lamportsToTransfer === 0) {
      const walletsData = readJson()
      saveNewFile(walletsData.filter(({ privateKey }) => base58.encode(kp.secretKey) !== privateKey))
      console.log(`Removed empty wallet ${kp.publicKey.toBase58()} from data.json`)
      return
    }

    const ixs = await buildGatherInstructions(kp, tokenAccounts)
    if (ixs.length === 0) return

    const computeUnits = Math.min(1_400_000, 20_000 + ixs.length * 12_000)
    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
      ...ixs,
    )
    tx.feePayer = mainKp.publicKey
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

    const simResult = await connection.simulateTransaction(tx, [mainKp, kp])
    if (simResult.value.err) {
      console.log(`Wallet ${index} simulation failed:`, simResult.value.err)
      return
    }

    const sig = await sendAndConfirmTransaction(connection, tx, [mainKp, kp], { commitment: 'finalized' })
    console.log(`Gathered wallet ${index}: https://solscan.io/tx/${sig}`)

    await sleep(500)
    const remainingSol = await connection.getBalance(kp.publicKey, 'confirmed')
    const remainingTokens = await getAllTokenAccounts(kp.publicKey)
    if (remainingSol === 0 && remainingTokens.length === 0) {
      const walletsData = readJson()
      saveNewFile(walletsData.filter(({ privateKey }) => base58.encode(kp.secretKey) !== privateKey))
      console.log(`Removed drained wallet ${kp.publicKey.toBase58()} from data.json`)
    }
  } catch (error) {
    console.log(`Error gathering wallet ${index}:`, error)
  }
}

const main = async () => {
  console.log(`Main wallet: ${mainKp.publicKey.toBase58()}`)

  const walletsData = readJson()
  if (walletsData.length === 0) {
    console.log('No wallets in data.json')
    return
  }

  console.log(`Processing ${walletsData.length} wallets`)
  const wallets = walletsData.map(({ privateKey }) => Keypair.fromSecretKey(base58.decode(privateKey)))
  await Promise.all(wallets.map((kp, i) => processWallet(kp, i)))
}

main()
