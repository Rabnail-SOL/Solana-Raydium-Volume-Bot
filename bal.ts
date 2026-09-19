import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import base58 from 'bs58'
import { Keypair } from '@solana/web3.js'
import { PRIVATE_KEY } from './constants'
import { connection } from './executor/legacy'
import { readJson } from './utils'

const mainKp = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const main = async () => {
  const mainBal = await connection.getBalance(mainKp.publicKey)
  console.log(`Main wallet: ${mainKp.publicKey.toBase58()}`)
  console.log(`Balance: ${(mainBal / LAMPORTS_PER_SOL).toFixed(6)} SOL`)

  const wallets = readJson()
  console.log(`\nSub-wallets in data.json: ${wallets.length}`)

  let totalSub = 0
  for (const wallet of wallets) {
    const kp = Keypair.fromSecretKey(base58.decode(wallet.privateKey))
    const bal = await connection.getBalance(kp.publicKey)
    totalSub += bal
    if (bal > 0) {
      console.log(`  ${wallet.pubkey}: ${(bal / LAMPORTS_PER_SOL).toFixed(6)} SOL`)
    }
  }

  console.log(`\nTotal in sub-wallets: ${(totalSub / LAMPORTS_PER_SOL).toFixed(6)} SOL`)
}

main()
