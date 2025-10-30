# Solana x402 Integration Guide

Complete guide for implementing the x402 payment protocol on Solana.

## Why Solana for x402?

Solana is ideal for x402 micropayments because:

1. **Ultra-Low Fees**: ~$0.00025 per transaction vs $1-50 on Ethereum
2. **Instant Settlement**: 400ms block times enable real-time payment verification
3. **True Micropayments**: Economically viable to charge $0.001-0.01 per API call
4. **High Throughput**: 65,000+ TPS supports massive scale
5. **SPL Token Support**: Built-in support for USDC, USDT, and any SPL token

## Architecture Overview

```
┌─────────┐                    ┌─────────┐
│ Client  │                    │ Server  │
│         │                    │         │
│ 1. GET  │──────────────────>│         │
│         │                    │ 2. 402  │
│         │<──────────────────│ Payment │
│         │    Payment Req     │ Required│
│         │                    │         │
│ 3. Sign │                    │         │
│    TX   │                    │         │
│         │                    │         │
│ 4. POST │──────────────────>│         │
│    w/   │   X-Payment Header │ 5.     │
│  Proof  │                    │ Submit  │
│         │                    │ & Verify│
│         │                    │   TX    │
│         │                    │         │
│         │<──────────────────│ 6. 200  │
│         │    Content         │ OK      │
└─────────┘                    └─────────┘
```

## Implementation Steps

### 1. Server Setup

**Install Dependencies:**
```bash
npm install @solana/web3.js @solana/spl-token express
```

**Key Server Components:**
```javascript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
```

**Return 402 with Payment Requirements:**
```javascript
app.get('/premium', async (req, res) => {
  if (!req.headers['x-payment']) {
    return res.status(402).json({
      x402Version: 1,
      accepts: [{
        scheme: "exact",
        network: "solana-devnet",
        recipientWallet: WALLET.publicKey.toBase58(),
        tokenAccount: TOKEN_ACCOUNT.toBase58(),
        mint: USDC_MINT.toBase58(),
        amount: 1000000, // 1 USDC
        resource: "/premium",
        description: "Premium content"
      }]
    });
  }
  // Verify payment...
});
```

**Verify Payment:**
```javascript
// 1. Decode X-Payment header
const paymentProof = JSON.parse(
  Buffer.from(req.headers['x-payment'], 'base64').toString('utf-8')
);

// 2. Submit transaction to Solana
const signature = await connection.sendRawTransaction(
  Buffer.from(paymentProof.payload.serializedTransaction, 'base64')
);

// 3. Confirm transaction
await connection.confirmTransaction(signature, "confirmed");

// 4. Verify amount received
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0
});

// Check token balance changes to verify correct amount
```

### 2. Client Setup

**Create Payment Transaction:**
```javascript
import { Transaction } from "@solana/web3.js";
import { createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";

// Get payer's token account
const payerTokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  mint,
  payer.publicKey
);

// Create transfer transaction
const tx = new Transaction();
tx.add(
  createTransferInstruction(
    payerTokenAccount.address,
    recipientTokenAccount,
    payer.publicKey,
    amount
  )
);

// Sign transaction
tx.sign(payer);

// Serialize for x402 payment proof
const serializedTx = tx.serialize().toString('base64');
```

**Send Payment Proof:**
```javascript
const paymentProof = {
  x402Version: 1,
  scheme: "exact",
  network: "solana-devnet",
  payload: {
    serializedTransaction: serializedTx
  }
};

const xPaymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString('base64');

const response = await fetch(url, {
  headers: {
    'X-Payment': xPaymentHeader
  }
});
```

## Payment Flow Details

### Transaction Structure

A Solana x402 payment transaction typically contains:

1. **Transfer Instruction**: SPL Token transfer from client to server
2. **Optional ATA Creation**: Create associated token account if needed
3. **Signatures**: Client's signature authorizing the transfer

### Verification Process

The server verifies:

1. ✅ Transaction is valid and confirmed on-chain
2. ✅ Recipient matches the server's token account
3. ✅ Amount transferred meets or exceeds required amount
4. ✅ Token mint is correct (e.g., USDC)
5. ✅ Transaction hasn't been used before (replay protection)

### Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| `Insufficient balance` | Client lacks USDC | Fund wallet with devnet USDC |
| `Transaction failed` | Invalid transaction | Check account exists, sufficient SOL for fees |
| `Insufficient payment` | Amount too low | Verify payment amount matches requirement |
| `Token account not found` | ATA doesn't exist | Add createAssociatedTokenAccount instruction |

## Security Considerations

### 1. Replay Attack Prevention

**Problem**: Client could reuse same payment proof multiple times.

**Solution**: Track used transaction signatures:
```javascript
const usedSignatures = new Set();

if (usedSignatures.has(signature)) {
  return res.status(402).json({ error: "Payment already used" });
}
usedSignatures.add(signature);
```

**Better**: Use database with TTL or check transaction timestamp.

### 2. Amount Verification

**Always verify the actual amount received:**
```javascript
const amountReceived = Number(postBalance.amount) - Number(preBalance.amount);
if (amountReceived < REQUIRED_AMOUNT) {
  return res.status(402).json({ error: "Insufficient payment" });
}
```

### 3. Token Mint Verification

**Ensure payment is in the correct token:**
```javascript
if (tokenBalance.mint !== EXPECTED_MINT) {
  return res.status(402).json({ error: "Wrong token" });
}
```

### 4. Transaction Finality

**Use appropriate commitment level:**
```javascript
// For critical operations
await connection.confirmTransaction(signature, "finalized");

// For most use cases
await connection.confirmTransaction(signature, "confirmed");
```

## Advanced Patterns

### 1. Subscription Model

Verify payment is sufficient for time period:
```javascript
const secondsPaidFor = amountReceived / PRICE_PER_SECOND;
const expiresAt = Date.now() + (secondsPaidFor * 1000);

// Issue JWT with expiration
const token = jwt.sign({ sub: clientId, exp: expiresAt }, SECRET);
```

### 2. Pay-Per-Use Metering

Track usage and require payment when threshold reached:
```javascript
let usage = 0;
const THRESHOLD = 100; // 100 API calls
const COST_PER_HUNDRED = 1000000; // 1 USDC

if (usage >= THRESHOLD && !verifyPayment()) {
  return res.status(402).json({ 
    usage, 
    amountDue: COST_PER_HUNDRED 
  });
}
```

### 3. Dynamic Pricing

Adjust price based on load or demand:
```javascript
const basePrice = 1000000; // 1 USDC
const loadMultiplier = currentLoad / maxLoad;
const dynamicPrice = Math.floor(basePrice * (1 + loadMultiplier));
```

### 4. Multi-Token Support

Accept multiple SPL tokens:
```javascript
const ACCEPTED_TOKENS = {
  'USDC': { mint: 'Gh9Z...', decimals: 6 },
  'USDT': { mint: 'Es9v...', decimals: 6 },
  'SOL': { mint: 'So11...', decimals: 9 }
};

// Return multiple payment options in 402 response
accepts: Object.entries(ACCEPTED_TOKENS).map(([symbol, token]) => ({
  scheme: "exact",
  network: "solana-devnet",
  mint: token.mint,
  amount: calculateAmount(basePrice, token.decimals),
  description: `Pay ${symbol}`
}))
```

## Performance Optimization

### 1. Connection Pooling

Reuse Solana RPC connections:
```javascript
const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: WS_URL,
  disableRetryOnRateLimit: false
});
```

### 2. Parallel Verification

Verify multiple payments concurrently:
```javascript
const results = await Promise.allSettled(
  payments.map(p => verifyPayment(p))
);
```

### 3. Caching

Cache transaction results:
```javascript
const cache = new Map();

async function getTransaction(signature) {
  if (cache.has(signature)) return cache.get(signature);
  const tx = await connection.getTransaction(signature);
  cache.set(signature, tx);
  return tx;
}
```

## Testing

### 1. Devnet Testing

Use devnet for development:
```javascript
const RPC_URL = "https://api.devnet.solana.com";
const USDC_MINT = "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"; // Devnet
```

Get devnet tokens:
```bash
# Airdrop SOL
solana airdrop 2 <ADDRESS> --url devnet

# Get USDC from faucet
# Visit: https://faucet.circle.com/
```

### 2. Unit Tests

Test payment verification logic:
```javascript
import { describe, it, expect } from 'vitest';

describe('Payment Verification', () => {
  it('should accept valid payment', async () => {
    const result = await verifyPayment(validSignature);
    expect(result.isValid).toBe(true);
  });

  it('should reject insufficient amount', async () => {
    const result = await verifyPayment(insufficientSignature);
    expect(result.isValid).toBe(false);
  });
});
```

### 3. Integration Tests

Test full payment flow:
```javascript
it('should complete payment flow', async () => {
  // 1. Request quote
  const quote = await fetch('/premium');
  expect(quote.status).toBe(402);

  // 2. Create and send payment
  const payment = await createPayment(quote.data);
  const result = await fetch('/premium', {
    headers: { 'X-Payment': payment }
  });

  expect(result.status).toBe(200);
});
```

## Mainnet Checklist

Before deploying to mainnet:

- [ ] Use mainnet RPC endpoint
- [ ] Update USDC mint to mainnet address
- [ ] Implement robust error handling
- [ ] Add replay attack prevention
- [ ] Set up monitoring and alerts
- [ ] Test with real but small amounts
- [ ] Implement rate limiting
- [ ] Add comprehensive logging
- [ ] Set appropriate transaction timeouts
- [ ] Use premium RPC provider for production
- [ ] Implement graceful degradation

## RPC Providers

Recommended Solana RPC providers:

| Provider | Free Tier | Cost | Notes |
|----------|-----------|------|-------|
| **Helius** | 100K req/day | $99/mo+ | Best for production |
| **QuickNode** | Limited | $9/mo+ | Good reliability |
| **Alchemy** | Limited | Custom | New Solana support |
| **Public RPC** | Unlimited | Free | Rate limited, dev only |

## Resources

### Official Documentation
- [Solana x402 Guide](https://solana.com/developers/guides/getstarted/intro-to-x402)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [SPL Token Program](https://spl.solana.com/token)

### SDKs & Tools
- [Corbits](https://corbits.dev/) - Solana x402 SDK
- [MCPay.tech](https://mcpay.tech/) - MCP server monetization
- [PayAI Network](https://payai.network/) - Facilitator service
- [x420scan](https://x420scan.com/) - Ecosystem explorer

### Example Code
- This repository: `/examples/solana/`
- [Official examples](https://github.com/Woody4618/x402-solana-examples)

## FAQ

**Q: Why use Solana over Ethereum for x402?**  
A: Transaction fees. $0.00025 on Solana vs $1-50 on Ethereum makes micropayments viable.

**Q: Can I use SOL instead of USDC?**  
A: Yes! Use native SOL transfers instead of SPL token transfers.

**Q: How do I handle transaction failures?**  
A: Return 402 with error details. Client can retry with new transaction.

**Q: What about transaction finality?**  
A: Use "confirmed" (400ms) for most cases, "finalized" (~13s) for critical operations.

**Q: How do I prevent double-spending?**  
A: Track used transaction signatures in database with TTL.

**Q: Can clients send the transaction themselves?**  
A: Yes, but server-side submission gives you better error handling and guarantees.

## Support

- Open an issue in this repository
- Check [Solana Stack Exchange](https://solana.stackexchange.com/)
- Join [Solana Discord](https://discord.gg/solana)

## License

MIT

