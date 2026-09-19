import { retrieveEnvVariable } from '../utils'

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY')
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT')

export const DISTRIBUTE_INTERVAL_MAX = Number(retrieveEnvVariable('DISTRIBUTE_INTERVAL_MAX'))
export const DISTRIBUTE_INTERVAL_MIN = Number(retrieveEnvVariable('DISTRIBUTE_INTERVAL_MIN'))

export const BUY_UPPER_PERCENT = Number(retrieveEnvVariable('BUY_UPPER_PERCENT'))
export const BUY_LOWER_PERCENT = Number(retrieveEnvVariable('BUY_LOWER_PERCENT'))

export const BUY_INTERVAL_MIN = Number(retrieveEnvVariable('BUY_INTERVAL_MIN'))
export const BUY_INTERVAL_MAX = Number(retrieveEnvVariable('BUY_INTERVAL_MAX'))

export const SELL_INTERVAL_MIN = Number(retrieveEnvVariable('SELL_INTERVAL_MIN'))
export const SELL_INTERVAL_MAX = Number(retrieveEnvVariable('SELL_INTERVAL_MAX'))

export const DISTRIBUTE_WALLET_NUM = Number(retrieveEnvVariable('DISTRIBUTE_WALLET_NUM'))
export const SOL_AMOUNT_TO_DISTRIBUTE = Number(retrieveEnvVariable('SOL_AMOUNT_TO_DISTRIBUTE'))

export const JITO_MODE = retrieveEnvVariable('JITO_MODE') === 'true'
export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE'))

export const SLIPPAGE = Number(retrieveEnvVariable('SLIPPAGE'))
export const FEE_LEVEL = Number(retrieveEnvVariable('FEE_LEVEL'))

export const TOKEN_MINT = retrieveEnvVariable('TOKEN_MINT')
