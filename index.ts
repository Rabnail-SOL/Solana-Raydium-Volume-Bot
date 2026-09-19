import {
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  Commitment,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import base58 from 'bs58'
import {
  BUY_INTERVAL_MAX,
  BUY_INTERVAL_MIN,
  BUY_LOWER_PERCENT,
  BUY_UPPER_PERCENT,
  DISTRIBUTE_INTERVAL_MAX,
  DISTRIBUTE_INTERVAL_MIN,
  DISTRIBUTE_WALLET_NUM,
  FEE_LEVEL,
  JITO_MODE,
  PRIVATE_KEY,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  SELL_INTERVAL_MAX,
  SELL_INTERVAL_MIN,
  SOL_AMOUNT_TO_DISTRIBUTE,
  TOKEN_MINT,
} from './constants'
import { execute } from './executor/legacy'
import { executeJitoTx } from './executor/jito'
import { Data, readJson, saveDataToFile, saveNewFile, sleep } from './utils'
import { getBuyTxWithJupiter, getSellTxWithJupiter } from './utils/swapOnlyAmm'

export const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: 'confirmed',
})

export const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))
const baseMint = new PublicKey(TOKEN_MINT)
const distributionNum = DISTRIBUTE_WALLET_NUM > 20 ? 20 : DISTRIBUTE_WALLET_NUM
const jitoCommitment: Commitment = 'confirmed'
const RESERVE_LAMPORTS = 5_000_000

const totalProcesses = new Set<string>()
const oneTimeBoughtProcesses = new Set<string>()
const twoTimeBoughtProcesses = new Set<string>()
const soldProcesses = new Set<string>()
const successfulProcesses = new Set<string>()

const main = async () => {
  const solBalance = await solanaConnection.getBalance(mainKp.publicKey)
  console.log('Volume bot is running')
  console.log(`Wallet address: ${mainKp.publicKey.toBase58()}`)
  console.log(`Pool token mint: ${baseMint.toBase58()}`)
  console.log(`Wallet SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(3)} SOL`)
  console.log(`Buying wait time max: ${BUY_INTERVAL_MAX}s`)
  console.log(`Buying wait time min: ${BUY_INTERVAL_MIN}s`)
  console.log(`Selling wait time max: ${SELL_INTERVAL_MAX}s`)
  console.log(`Selling wait time min: ${SELL_INTERVAL_MIN}s`)
  console.log(`Buy upper limit percent: ${BUY_UPPER_PERCENT}%`)
  console.log(`Buy lower limit percent: ${BUY_LOWER_PERCENT}%`)
  console.log(`Distribute SOL to ${distributionNum} wallets`)

  if (solBalance < (BUY_LOWER_PERCENT + 0.002) * distributionNum) {
    console.log('Sol balance is not enough for distribution')
  }

  for (;;) {
    try {
      console.log('---- New round of distribution ----\n')

      const data = await distributeSol(solanaConnection, mainKp, distributionNum)
      if (!data || data.length === 0) {
        console.log('Distribution failed')
        await sleep(30000)
        continue
      }

      const interval = Math.floor(
        (DISTRIBUTE_INTERVAL_MIN + Math.random() * (DISTRIBUTE_INTERVAL_MAX - DISTRIBUTE_INTERVAL_MIN)) * 1000,
      )

      data.map(async ({ kp }, n) => {
        totalProcesses.add(kp.publicKey.toBase58())
        await sleep(Math.round((n * BUY_INTERVAL_MAX) / DISTRIBUTE_WALLET_NUM * 1000))

        const srcKp = kp
        const buyWaitInterval = Math.round(Math.random() * (BUY_INTERVAL_MAX - BUY_INTERVAL_MIN) + BUY_INTERVAL_MIN)
        const sellWaitInterval = Math.round(Math.random() * (SELL_INTERVAL_MAX - SELL_INTERVAL_MIN) + SELL_INTERVAL_MIN)
        const walletSolBalance = await solanaConnection.getBalance(srcKp.publicKey, 'confirmed')

        if (walletSolBalance < RESERVE_LAMPORTS) {
          console.log('Sol balance is not enough in one of wallets')
          return
        }

        const buyAmountInPercent = Number(
          (Math.random() * (BUY_UPPER_PERCENT - BUY_LOWER_PERCENT) + BUY_LOWER_PERCENT).toFixed(3),
        )
        const buyAmountFirst = Math.floor(((walletSolBalance - RESERVE_LAMPORTS) / 100) * buyAmountInPercent)
        const buyAmountSecond = Math.floor(walletSolBalance - buyAmountFirst - RESERVE_LAMPORTS)

        console.log(
          `balance: ${walletSolBalance / 10 ** 9} first: ${buyAmountFirst / 10 ** 9} second: ${buyAmountSecond / 10 ** 9}`,
        )

        for (let i = 0; i < 50; i++) {
          const result = await buy(srcKp, baseMint, buyAmountFirst)
          if (result) break
          if (i === 49) console.log('Error in first buy transaction')
          await sleep(2000)
        }

        await sleep(buyWaitInterval * 1000)
        oneTimeBoughtProcesses.add(kp.publicKey.toBase58())

        for (let i = 0; i < 50; i++) {
          const result = await buy(srcKp, baseMint, buyAmountSecond)
          if (result) break
          if (i === 49) console.log('Error in second buy transaction')
          await sleep(2000)
        }

        twoTimeBoughtProcesses.add(kp.publicKey.toBase58())
        await sleep(sellWaitInterval * 1000)

        for (let j = 0; j < 50; j++) {
          const result = await sell(baseMint, srcKp)
          if (result) break
          if (j === 49) {
            console.log('Error in sell transaction')
            return
          }
          await sleep(2000)
        }

        soldProcesses.add(kp.publicKey.toBase58())

        for (let k = 0; k < 5; k++) {
          try {
            const lamportsToTransfer = await solanaConnection.getBalance(srcKp.publicKey, 'confirmed')
            if (lamportsToTransfer === 0) break

            const baseAta = getAssociatedTokenAddressSync(baseMint, srcKp.publicKey)
            const tx = new Transaction().add(
              ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 * FEE_LEVEL }),
              ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
              SystemProgram.transfer({
                fromPubkey: srcKp.publicKey,
                toPubkey: mainKp.publicKey,
                lamports: lamportsToTransfer,
              }),
            )

            const baseInfo = await solanaConnection.getAccountInfo(baseAta)
            if (baseInfo) {
              tx.add(createCloseAccountInstruction(baseAta, mainKp.publicKey, srcKp.publicKey))
            }

            tx.feePayer = mainKp.publicKey
            tx.recentBlockhash = (await solanaConnection.getLatestBlockhash()).blockhash

            const sig = await sendAndConfirmTransaction(solanaConnection, tx, [srcKp, mainKp], {
              skipPreflight: true,
              commitment: 'confirmed',
            })
            console.log(`Gathered SOL back to main wallet, https://solscan.io/tx/${sig}`)

            const walletsData = readJson()
            const wallets = walletsData.filter(({ privateKey }) => base58.encode(srcKp.secretKey) !== privateKey)
            saveNewFile(wallets)
            break
          } catch (error) {
            console.log('Error in gather transaction', error)
          }
        }

        successfulProcesses.add(kp.publicKey.toBase58())
      })

      await sleep(interval)
      checkMissing()
    } catch (error) {
      console.log('Error in one of the steps', error)
    }
  }
}

const distributeSol = async (connection: Connection, mainKp: Keypair, walletCount: number) => {
  const data: Data[] = []
  const wallets: Array<{ kp: Keypair; buyAmount: number }> = []

  try {
    const sendSolTx: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 * FEE_LEVEL }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 12_000 }),
    ]

    const mainSolBal = await connection.getBalance(mainKp.publicKey)
    if (mainSolBal <= 50_000_000) {
      console.log('Main wallet balance is not enough')
      return []
    }

    const solAmount = Math.floor((SOL_AMOUNT_TO_DISTRIBUTE * 10 ** 9) / walletCount)

    for (let i = 0; i < walletCount; i++) {
      const wallet = Keypair.generate()
      const lamports = Math.floor(solAmount * (1 - Math.random() * 0.2))
      wallets.push({ kp: wallet, buyAmount: solAmount })
      sendSolTx.push(
        SystemProgram.transfer({
          fromPubkey: mainKp.publicKey,
          toPubkey: wallet.publicKey,
          lamports,
        }),
      )
    }

    wallets.forEach((wallet) => {
      data.push({
        privateKey: base58.encode(wallet.kp.secretKey),
        pubkey: wallet.kp.publicKey.toBase58(),
      })
    })

    saveDataToFile(data)
    saveDataToFile(data, 'backup.json')

    const latestBlockhash = await solanaConnection.getLatestBlockhash()
    const messageV0 = new TransactionMessage({
      payerKey: mainKp.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: sendSolTx,
    }).compileToV0Message()
    const transaction = new VersionedTransaction(messageV0)
    transaction.sign([mainKp])

    const txSig = JITO_MODE
      ? await executeJitoTx([transaction], mainKp, jitoCommitment)
      : await execute(transaction, latestBlockhash, 1)

    if (txSig) {
      console.log(`SOL distributed https://solscan.io/tx/${txSig}`)
    } else {
      console.log('Distribution transaction failed')
      return null
    }

    console.log('Success in distribution')
    return wallets
  } catch (error) {
    console.log('Failed to transfer SOL', error)
    return null
  }
}

const buy = async (wallet: Keypair, mint: PublicKey, buyAmount: number) => {
  const solBalance = await solanaConnection.getBalance(wallet.publicKey)
  if (solBalance === 0 || buyAmount <= 0) {
    return null
  }

  try {
    const buySwap = await getBuyTxWithJupiter(wallet, mint, buyAmount)
    if (!buySwap) {
      console.log('Error getting buy transaction')
      return null
    }

    const txSig = JITO_MODE
      ? await executeJitoTx([buySwap.transaction], mainKp, jitoCommitment)
      : await execute(buySwap.transaction, { lastValidBlockHeight: buySwap.lastValidBlockHeight }, 1)

    if (!txSig) return null
    console.log(`Success in buy transaction: https://solscan.io/tx/${txSig}`)
    return txSig
  } catch (error) {
    console.log('Buy transaction error', error)
    await sleep(1000)
    return null
  }
}

const sell = async (mint: PublicKey, wallet: Keypair) => {
  try {
    const tokenAta = getAssociatedTokenAddressSync(mint, wallet.publicKey)
    const tokenBalInfo = await solanaConnection.getTokenAccountBalance(tokenAta)
    if (!tokenBalInfo?.value.amount || tokenBalInfo.value.amount === '0') {
      console.log('No token balance to sell')
      return null
    }

    const sellSwap = await getSellTxWithJupiter(wallet, mint, tokenBalInfo.value.amount)
    if (!sellSwap) {
      console.log('Error getting sell transaction')
      return null
    }

    const txSig = JITO_MODE
      ? await executeJitoTx([sellSwap.transaction], mainKp, jitoCommitment)
      : await execute(sellSwap.transaction, { lastValidBlockHeight: sellSwap.lastValidBlockHeight }, 1)

    if (!txSig) return null
    console.log(`Success in sell transaction: https://solscan.io/tx/${txSig}`)
    return txSig
  } catch (error) {
    console.log('Sell transaction error', error)
    await sleep(1000)
    return null
  }
}

const checkMissing = () => {
  const missing = (total: Set<string>, done: Set<string>) => [...total].filter((item) => !done.has(item))

  console.log('\n=========== Checking Missed Wallets ===========')
  console.log('one step:', missing(totalProcesses, oneTimeBoughtProcesses))
  console.log('two step:', missing(oneTimeBoughtProcesses, twoTimeBoughtProcesses))
  console.log('sell step:', missing(twoTimeBoughtProcesses, soldProcesses))
  console.log('final step:', missing(soldProcesses, successfulProcesses))
  console.log('\n==============================================\n')
}

main()
