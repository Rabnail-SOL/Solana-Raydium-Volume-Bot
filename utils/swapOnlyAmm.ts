import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { FEE_LEVEL, SLIPPAGE } from '../constants'

const WSOL_MINT = 'So11111111111111111111111111111111111111112'
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote'
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap'

export type JupiterSwapResult = {
  transaction: VersionedTransaction
  lastValidBlockHeight: number
}

type JupiterQuoteResponse = Record<string, unknown>

async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
): Promise<JupiterQuoteResponse | null> {
  const url =
    `${JUPITER_QUOTE_API}?inputMint=${inputMint}` +
    `&outputMint=${outputMint}&amount=${amount}&slippageBps=${SLIPPAGE}`

  const response = await fetch(url)
  const quote = (await response.json()) as JupiterQuoteResponse & { error?: string }

  if (!response.ok || quote.error) {
    console.log('Jupiter quote error:', quote.error ?? `HTTP ${response.status}`)
    return null
  }

  if (!quote.routePlan) {
    console.log('Jupiter quote error: no route found')
    return null
  }

  return quote
}

async function buildJupiterSwapTx(
  wallet: Keypair,
  quoteResponse: JupiterQuoteResponse,
): Promise<JupiterSwapResult | null> {
  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 2_500 * FEE_LEVEL,
    }),
  })

  const swap = (await response.json()) as {
    swapTransaction?: string
    lastValidBlockHeight?: number
    error?: string
    simulationError?: unknown
  }

  if (!response.ok || swap.error) {
    console.log('Jupiter swap error:', swap.error ?? `HTTP ${response.status}`)
    return null
  }

  if (swap.simulationError) {
    console.log('Jupiter swap simulation error:', swap.simulationError)
    return null
  }

  if (!swap.swapTransaction || swap.lastValidBlockHeight == null) {
    console.log('Jupiter swap error: missing transaction data')
    return null
  }

  const transaction = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, 'base64'))
  transaction.sign([wallet])

  return {
    transaction,
    lastValidBlockHeight: swap.lastValidBlockHeight,
  }
}

async function getJupiterSwapTx(
  inputMint: string,
  outputMint: string,
  amount: string,
  wallet: Keypair,
): Promise<JupiterSwapResult | null> {
  try {
    const quoteResponse = await fetchJupiterQuote(inputMint, outputMint, amount)
    if (!quoteResponse) {
      return null
    }
    return await buildJupiterSwapTx(wallet, quoteResponse)
  } catch (error) {
    console.log('Failed to get Jupiter swap transaction:', error)
    return null
  }
}

export const getBuyTxWithJupiter = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: number,
): Promise<JupiterSwapResult | null> => {
  if (amount <= 0) {
    console.log('Buy amount must be greater than zero')
    return null
  }
  return getJupiterSwapTx(WSOL_MINT, baseMint.toBase58(), String(amount), wallet)
}

export const getSellTxWithJupiter = async (
  wallet: Keypair,
  baseMint: PublicKey,
  amount: string,
): Promise<JupiterSwapResult | null> => {
  if (!amount || amount === '0') {
    console.log('Sell amount must be greater than zero')
    return null
  }
  return getJupiterSwapTx(baseMint.toBase58(), WSOL_MINT, amount, wallet)
}
