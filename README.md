#  BSC-x402 payments protocol

BSC-x402 payments protocol on internet are fundamentally flawed. Credit Cards are high friction, hard to accept, have minimum payments that are far too high, and don't fit into the programmatic nature of the internet.
It's time for an open, internet-native form of payments. A payment rail that doesn't have high minimums + % based fee. Payments that are amazing for humans and AI agents.

> "1 line of code to accept digital dollars. No fee, 2 second settlement, $0.001 minimum payment."

```typescript
app.use(
  // How much you want to charge, and where you want the funds to land
  paymentMiddleware("0xYourAddress", { "/your-endpoint": "$0.01" })
);
// That's it! See examples/typescript/servers/express.ts for a complete example. Instruction below for running on base-sepolia.
```
## Contact

If you have any question, contact here: [Telegram](https://t.me/shiny0103) | [Twitter](https://x.com/0xTan1319)

## Technical Goals:

- Permissionless and secure for clients and servers
- Gasless for client and resource servers
- Minimal integration for the resource server and client (1 line for the server, 1 function for the client)
- Ability to trade off speed of response for guarantee of payment
- Extensible to different payment flows and chains

## V1 Protocol

The `BSC-x402` protocol is a chain agnostic standard for payments on top of HTTP, leverage the existing `402 Payment Required` HTTP status code to indicate that a payment is required for access to the resource.

It specifies:

1. A schema for how servers can respond to clients to facilitate payment for a resource (`PaymentRequirements`)
2. A standard header `X-PAYMENT` that is set by clients paying for resources
3. A standard schema and encoding method for data in the `X-PAYMENT` header
4. A recommended flow for how payments should be verified and settled by a resource server
5. A REST specification for how a resource server can perform verification and settlement against a remote 3rd party server (`facilitator`)
6. A specification for a `X-PAYMENT-RESPONSE` header that can be used by resource servers to communicate blockchain transactions details to the client in their HTTP response

### Type Specifications

#### Data types

**Payment Required Response**

```json5
{
  // Version of the x402 payment protocol
  x402Version: int,

  // List of payment requirements that the resource server accepts. A resource server may accept on multiple chains, or in multiple currencies.
  accepts: [paymentRequirements]

  // Message from the resource server to the client to communicate errors in processing payment
  error: string
}
```

**paymentRequirements**

```json5
{
  // Scheme of the payment protocol to use
  scheme: string;

  // Network of the blockchain to send payment on
  network: string;

  // Maximum amount required to pay for the resource in atomic units of the asset
  maxAmountRequired: uint256 as string;

  // URL of resource to pay for
  resource: string;

  // Description of the resource
  description: string;

  // MIME type of the resource response
  mimeType: string;

  // Output schema of the resource response
  outputSchema?: object | null;

  // Address to pay value to
  payTo: string;

  // Maximum time in seconds for the resource server to respond
  maxTimeoutSeconds: number;

  // Address of the EIP-3009 compliant ERC20 contract
  asset: string;

  // Extra information about the payment details specific to the scheme
  // For `exact` scheme on a EVM network, expects extra to contain the records `name` and `version` pertaining to asset
  extra: object | null;
}
```

**`Payment Payload`** (included as the `X-PAYMENT` header in base64 encoded json)

```json5
{
  // Version of the x402 payment protocol
  x402Version: number;

  // scheme is the scheme value of the accepted `paymentRequirements` the client is using to pay
  scheme: string;

  // network is the network id of the accepted `paymentRequirements` the client is using to pay
  network: string;

  // payload is scheme dependent
  payload: <scheme dependent>;
}
```

#### Facilitator Types & Interface

A `facilitator server` is a 3rd party service that can be used by a `resource server` to verify and settle payments, without the `resource server` needing to have access to a blockchain node or wallet.

**POST /verify**. Verify a payment with a supported scheme and network:

- Request body JSON:
  ```json5
  {
    x402Version: number;
    paymentHeader: string;
    paymentRequirements: paymentRequirements;
  }
  ```
- Response:
  ```json5
  {
    isValid: boolean;
    invalidReason: string | null;
  }
  ```

**POST /settle**. Settle a payment with a supported scheme and network:

- Request body JSON:

  ```json5
  {
    x402Version: number;
    paymentHeader: string;
    paymentRequirements: paymentRequirements;
  }
  ```

- Response:

  ```json5
  {
    // Whether the payment was successful
    success: boolean;

    // Error message from the facilitator server
    error: string | null;

    // Transaction hash of the settled payment
    txHash: string | null;

    // Network id of the blockchain the payment was settled on
    networkId: string | null;
  }
  ```

**GET /supported**. Get supported payment schemes and networks:

- Response:
  ```json5
  {
    kinds: [
      {
        "scheme": string,
        "network": string,
      }
    ]
  }
  ```

### Schemes

A scheme is a logical way of moving money.

Blockchains allow for a large number of flexible ways to move money. To help facilitate an expanding number of payment use cases, the `BSC-x402` protocol is extensible to different ways of settling payments via its `scheme` field.

Each payment scheme may have different operational functionality depending on what actions are necessary to fulfill the payment.
For example `exact`, the first scheme shipping as part of the protocol, would have different behavior than `upto`. `exact` transfers a specific amount (ex: pay $1 to read an article), while a theoretical `upto` would transfer up to an amount, based on the resources consumed during a request (ex: generating tokens from an LLM).

See `specs/schemes` for more details on schemes, and see `specs/schemes/exact/scheme_exact_evm.md` to see the first proposed scheme for exact payment on EVM chains.

### Schemes vs Networks

Because a scheme is a logical way of moving money, the way a scheme is implemented can be different for different blockchains. (ex: the way you need to implement `exact` on Ethereum is very different from the way you need to implement `exact` on Solana).

Clients and facilitators must explicitly support different `(scheme, network)` pairs in order to be able to create proper payloads and verify / settle payments.

## Running example

**Requirements:** Node.js v24 or higher

1. From `examples/typescript` run `pnpm install` and `pnpm build` to ensure all dependent packages and examples are setup.

2. Select a server, i.e. express, and `cd` into that example. Add your server's ethereum address to get paid to into the `.env` file, and then run `pnpm dev` in that directory.

3. Select a client, i.e. axios, and `cd` into that example. Add your private key for the account making payments into the `.env` file, and then run `pnpm dev` in that directory.

You should see activities in the client terminal, which will display a weather report.

## Running tests

1. Navigate to the typescript directory: `cd typescript`
2. Install dependencies: `pnpm install`
3. Run the unit tests: `pnpm test`

This will run the unit tests for the BSC-x402 packages.
