import {
  Commitment,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import base58 from 'bs58'
import axios from 'axios'
import { JITO_FEE } from '../constants'
import { connection } from './legacy'

export const executeJitoTx = async (
  transactions: VersionedTransaction[],
  payer: Keypair,
  commitment: Commitment,
) => {
  const tipAccounts = [
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  ]
  const jitoFeeWallet = new PublicKey(tipAccounts[Math.floor(Math.random() * tipAccounts.length)])

  try {
    const latestBlockhash = await connection.getLatestBlockhash()
    const jitoFeeMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: jitoFeeWallet,
          lamports: Math.floor(JITO_FEE * 10 ** 9),
        }),
      ],
    }).compileToV0Message()

    const jitoFeeTx = new VersionedTransaction(jitoFeeMessage)
    jitoFeeTx.sign([payer])

    const jitoTxSignature = base58.encode(transactions[0].signatures[0])
    const serializedTransactions = [
      base58.encode(jitoFeeTx.serialize()),
      ...transactions.map((tx) => base58.encode(tx.serialize())),
    ]

    const endpoints = ['https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles']
    const results = await Promise.all(
      endpoints.map((url) =>
        axios.post(url, {
          jsonrpc: '2.0',
          id: 1,
          method: 'sendBundle',
          params: [serializedTransactions],
        }),
      ),
    )

    const successfulResults = results.filter((result) => !(result instanceof Error))
    if (successfulResults.length === 0) {
      console.log('No successful responses received for jito')
      return null
    }

    const confirmation = await connection.confirmTransaction(
      {
        signature: jitoTxSignature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      },
      commitment,
    )

    if (confirmation.value.err) {
      console.log('Confirmation error')
      return null
    }

    return jitoTxSignature
  } catch (error) {
    console.log('Error during Jito transaction execution', error)
    return null
  }
}
