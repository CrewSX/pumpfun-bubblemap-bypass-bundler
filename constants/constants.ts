import { PublicKey } from "@solana/web3.js"
import { retrieveEnvVariable } from "../utils"
// import { PublicKey } from "@solana/web3.js";

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY')
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT')
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT')
export const LIL_JIT_ENDPOINT = retrieveEnvVariable('LIL_JIT_ENDPOINT') || 'https://devnet.block-engine.jito.wtf/api/v1/bundles'
console.log("🚀 ~ LIL_JIT_ENDPOINT:", LIL_JIT_ENDPOINT)

export const TOKEN_NAME = retrieveEnvVariable('TOKEN_NAME')
export const TOKEN_SYMBOL = retrieveEnvVariable('TOKEN_SYMBOL')
export const DESCRIPTION = retrieveEnvVariable('DESCRIPTION')
export const TOKEN_SHOW_NAME = retrieveEnvVariable('TOKEN_SHOW_NAME')
export const TOKEN_CREATE_ON = retrieveEnvVariable('TOKEN_CREATE_ON')
export const TWITTER = retrieveEnvVariable('TWITTER')
export const TELEGRAM = retrieveEnvVariable('TELEGRAM')
export const WEBSITE = retrieveEnvVariable('WEBSITE')
export const FILE = retrieveEnvVariable('FILE')
export const VANITY_MODE = false

export const SWAP_AMOUNT = Number(retrieveEnvVariable('SWAP_AMOUNT'))
export const DISTRIBUTION_WALLETNUM = Number(retrieveEnvVariable('DISTRIBUTION_WALLETNUM'))

export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE'))

// MODE: 1 = JITO MODE, 2 = BLOXROUTE MODE
export const MODE = Number(process.env.MODE || '1')
console.log("🚀 ~ MODE:", MODE === 1 ? "JITO" : "BLOXROUTE")

// BloxRoute Constants
export const BLOXROUTE_AUTH_TOKEN = process.env.BLOXROUTE_AUTH_TOKEN || ''
export const BLOXROUTE_SUBMIT_BATCH_URL = 'https://germany.solana.dex.blxrbdn.com/api/v2/submit-batch'
export const BLOXROUTE_TIP_AMOUNT_SOL = 0.001
export const BLOXROUTE_TIP_ACCOUNTS = [
  'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg'
]

export const global_mint = new PublicKey("p89evAyzjd9fphjJx7G3RFA48sbZdpGEppRcfRNpump")
export const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export const BUYER_WALLET = ""
export const BUYER_AMOUNT = 0
