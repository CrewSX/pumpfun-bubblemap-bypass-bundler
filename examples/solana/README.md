# x402 Solana Example

A minimal implementation of the x402 payment protocol on Solana. This example demonstrates how to accept USDC micropayments for premium content using the HTTP 402 Payment Required pattern.

## Features

- ✅ Pay-per-access content with USDC on Solana
- ✅ Near-zero transaction fees (fractions of a cent)
- ✅ Instant settlement and verification
- ✅ SPL Token support (USDC example)
- ✅ x402 protocol compliant
- ✅ Minimal dependencies

## How It Works

1. **Client requests content** → Server responds with `402 Payment Required` and payment details
2. **Client creates payment** → Constructs and signs a Solana USDC transfer transaction
3. **Client sends payment proof** → Includes signed transaction in `X-Payment` header
4. **Server verifies payment** → Submits transaction to Solana and verifies amount received
5. **Server delivers content** → Returns premium content in 200 OK response

## Prerequisites

- Node.js v18 or higher
- Solana CLI (optional, for wallet management)
- Devnet SOL and USDC for testing

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Wallets

Create two wallet files: one for the server (recipient) and one for the client (payer).

**Option A: Using Solana CLI**
```bash
# Generate server wallet
solana-keygen new --outfile server-wallet.json --no-bip39-passphrase

# Generate client wallet
solana-keygen new --outfile client-wallet.json --no-bip39-passphrase
```

**Option B: Using Node.js**
```javascript
import { Keypair } from "@solana/web3.js";
import { writeFileSync } from "fs";

const keypair = Keypair.generate();
writeFileSync('server-wallet.json', JSON.stringify(Array.from(keypair.secretKey)));
```

### 3. Fund the Client Wallet

The client needs SOL for transaction fees and USDC for payments.

**Get Devnet SOL:**
```bash
solana airdrop 2 <CLIENT_WALLET_ADDRESS> --url devnet
```

**Get Devnet USDC:**

Option 1: Use Circle's devnet USDC faucet
- Visit: https://faucet.circle.com/
- Enter your client wallet address
- Request devnet USDC

Option 2: Use SPL Token faucet
```bash
spl-token create-account Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr --url devnet
spl-token mint Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr 10 <TOKEN_ACCOUNT> --url devnet
```

### 4. Configure Environment (Optional)

Create a `.env` file to customize settings:

```env
# RPC endpoint
RPC_URL=https://api.devnet.solana.com

# Server port
PORT=3001

# Server endpoint URL for client
SERVER_URL=http://localhost:3001

# USDC mint address (devnet)
USDC_MINT=Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr

# Price in smallest USDC units (1000000 = 1 USDC)
PRICE_USDC=1000000
```

## Running the Example

### Start the Server

In one terminal:
```bash
npm run server
```

You should see:
```
Server wallet loaded: <WALLET_ADDRESS>
Server USDC token account: <TOKEN_ACCOUNT>

🚀 x402 Solana server listening on http://localhost:3001
💰 Accepting USDC payments: 1 USDC
📍 Premium endpoint: http://localhost:3001/premium

Ready to accept payments!
```

### Run the Client

In another terminal:
```bash
npm run client
```

The client will:
1. Request payment quote from server
2. Create and sign a USDC transfer transaction
3. Send payment proof to server via `X-Payment` header
4. Receive premium content after verification

Expected output:
```
💳 x402 Solana Payment Client

Step 1: Requesting payment quote from server...

📋 Payment Required:
  Amount: 1 USDC
  Recipient: <RECIPIENT_WALLET>
  Token Account: <TOKEN_ACCOUNT>
  Network: solana-devnet

...

✅ PAYMENT SUCCESSFUL!

📦 Premium Content:
  🎉 Premium content unlocked! This is exclusive data accessible only after USDC payment on Solana.

💰 Payment Details:
  Amount Paid: 1 USDC
  Transaction: <TX_SIGNATURE>
  Recipient: <TOKEN_ACCOUNT>

🔗 View on Solana Explorer:
  https://explorer.solana.com/tx/<TX_SIGNATURE>?cluster=devnet
```

## API Reference

### Server Endpoints

#### `GET /premium`

**Without payment (402 response):**
```bash
curl http://localhost:3001/premium
```

Response:
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "solana-devnet",
    "recipientWallet": "...",
    "tokenAccount": "...",
    "mint": "...",
    "amount": 1000000,
    "amountUSDC": 1,
    "resource": "/premium",
    "description": "Premium content access",
    "mimeType": "application/json"
  }]
}
```

**With payment (200 response):**
```bash
curl -H "X-Payment: <BASE64_PAYMENT_PROOF>" http://localhost:3001/premium
```

Response:
```json
{
  "data": "Premium content unlocked!",
  "paymentDetails": {
    "signature": "...",
    "amount": 1000000,
    "amountUSDC": 1,
    "recipient": "...",
    "explorerUrl": "https://explorer.solana.com/tx/...?cluster=devnet"
  }
}
```

#### `GET /health`

Health check endpoint:
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "network": "solana-devnet",
  "recipientWallet": "...",
  "tokenAccount": "..."
}
```

## x402 Payment Proof Format

The `X-Payment` header contains a base64-encoded JSON object:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "solana-devnet",
  "payload": {
    "serializedTransaction": "<BASE64_SIGNED_TX>"
  }
}
```

## Customization

### Change the Price

Edit `.env` or modify in `server.js`:
```javascript
const PRICE_USDC = 500000; // 0.5 USDC
```

### Use Different SPL Tokens

Replace USDC mint with any SPL token:
```javascript
const TOKEN_MINT = new PublicKey("YOUR_TOKEN_MINT_ADDRESS");
```

### Add Authentication

Combine with JWT or session tokens:
```javascript
app.get('/premium', authenticateJWT, async (req, res) => {
  // x402 payment verification
  // + user authentication
});
```

## Mainnet Deployment

To deploy on mainnet:

1. Update RPC URL:
   ```env
   RPC_URL=https://api.mainnet-beta.solana.com
   ```

2. Use mainnet USDC mint:
   ```env
   USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```

3. Fund wallets with real SOL and USDC

4. Update network in code:
   ```javascript
   network: "solana-mainnet"
   ```

## Troubleshooting

### "Insufficient USDC balance"
- Fund your client wallet with devnet USDC using Circle's faucet
- Verify balance: `spl-token balance <MINT> --url devnet`

### "Transaction failed"
- Check SOL balance for transaction fees
- Verify RPC endpoint is accessible
- Ensure wallets are on the correct network (devnet)

### "Could not fetch transaction details"
- Wait a few seconds and retry
- Check Solana network status
- Try a different RPC endpoint

## Learn More

- [Solana x402 Guide](https://solana.com/developers/guides/getstarted/intro-to-x402)
- [x402 Protocol Spec](../../specs/)
- [Solana Web3.js Docs](https://solana-labs.github.io/solana-web3.js/)
- [SPL Token Program](https://spl.solana.com/token)

## License

MIT

