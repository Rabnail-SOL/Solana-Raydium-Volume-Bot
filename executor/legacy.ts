import { Connection, VersionedTransaction } from '@solana/web3.js'
import { RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from '../constants'

export const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
  commitment: 'confirmed',
})

type ConfirmMeta = {
  lastValidBlockHeight: number
}

export const execute = async (
  transaction: VersionedTransaction,
  confirmMeta: ConfirmMeta,
  isBuy: boolean | 1 = true,
) => {
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true })
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: transaction.message.recentBlockhash,
      lastValidBlockHeight: confirmMeta.lastValidBlockHeight,
    },
    'finalized',
  )

  if (confirmation.value.err) {
    console.log('Confirmation error')
    return ''
  }

  if (isBuy === 1) {
    return signature
  }

  if (isBuy) {
    console.log(`Success in buy transaction: https://solscan.io/tx/${signature}`)
  } else {
    console.log(`Success in sell transaction: https://solscan.io/tx/${signature}`)
  }

  return signature
}
