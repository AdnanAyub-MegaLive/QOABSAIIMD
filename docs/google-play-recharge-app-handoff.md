# Android hand-off: Google Play coin recharge

Finance → Google Recharge manages the catalog. Admins can add a Play product ID and its coin amount, and enable or disable sales. Coin amounts are fixed per ID so an already-paid purchase always delivers the advertised amount. Use a new Play ID for a different amount.

| Play product ID | Coins per unit |
| --- | ---: |
| payment_07 | 42,000 |
| payment_06 | 126,000 |
| payment_05 | 420,000 |
| payment_04 | 1,260,000 |
| payment_03 | 2,100,000 |
| payment_11 | 4,284,000 |

## Android flow

1. With the signed-in user's Bearer token, call `GET /api/v1/wallet/google-recharge`. The response is `{ "success": true, "data": { "obfuscatedAccountId": "...", "products": [{ "productId": "payment_07", "coins": "42000" }] } }`. Use the returned list, not hardcoded IDs. Coin amounts are decimal strings.
2. Query Google Play Billing for those IDs as one-time `INAPP` products. Show Play's localized price and use the eligible purchase option/offer returned by Play. Hide products that Play does not return for the current shopper.
3. Launch billing with `setObfuscatedAccountId(data.obfuscatedAccountId)` for that Mega Live account. Only submit purchases in the PURCHASED state. For PENDING show a pending state. On cancellation leave the wallet alone.
4. Submit `POST /api/v1/wallet/google-recharge` with the same Bearer token, JSON content type and body `{"productId":"payment_07","purchaseToken":"<token from Play>"}`. The backend verifies the purchase with Google and checks the Mega Live account binding. It calculates coins using the verified quantity. The app supplies neither a price nor a coin amount.
5. On success expect `{"success":true,"data":{"productId":"payment_07","creditedCoins":"42000","quantity":1,"consume":true}}`. Refresh wallet balance and history. Consume the token with Play Billing **only after this response**. Consumption fulfills the acknowledgment requirement for a consumable and enables repurchase. The server is responsible for credit and the app is responsible for consumption.
6. Process the purchases-updated callback and query owned INAPP purchases on reconnect/resume. Replay the same POST after a lost response. A credited token returns the same credited amount without adding coins again. Retry failed consumption independently. Never add coins locally or show a second credit on replay.

| Error code | App behavior |
| --- | --- |
| PURCHASE_PENDING | Leave unconsumed. Retry once Play reports PURCHASED. |
| PURCHASE_INVALID / PURCHASE_MISMATCH | Leave unconsumed. Check the Mega Live account and product. |
| SERVER_PROBLEM / network timeout | Leave unconsumed. Retry the same token. |
| RECHARGE_UNAVAILABLE / PRODUCT_UNAVAILABLE | Leave unconsumed and offer support. |

## Production setup and release check

Deploy the migration and set `GOOGLE_PLAY_PACKAGE_NAME` to the registered Android application ID. Configure Google Application Default Credentials on the **server** for an identity authorized to read purchases for this Play Console app, with the Google Play Android Developer API enabled. On the Droplet, `GOOGLE_APPLICATION_CREDENTIALS` can point to a protected service-account file outside the checkout. Never bundle those credentials in Android.

Before releasing, use a Play license tester to buy payment_07, confirm one 42,000-coin wallet credit, replay the token, consume it, and buy again. Also test cancellation, pending payment, and retry after disconnect. Existing purchases without this account binding require support review. This flow handles purchase verification and delivery; automatic post-purchase refund/chargeback reconciliation is outside this release.

[Play Billing integration](https://developer.android.com/google/play/billing/integrate) · [Purchase verification API](https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get)
