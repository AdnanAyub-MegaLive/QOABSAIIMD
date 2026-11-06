CREATE TABLE "GoogleRechargeProduct" (
  "productId" TEXT PRIMARY KEY, "coins" BIGINT NOT NULL CHECK ("coins" > 0), "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "GoogleRechargeProduct" ("productId","coins") VALUES
 ('payment_07',42000),('payment_06',126000),('payment_05',420000),('payment_04',1260000),('payment_03',2100000),('payment_11',4284000);
CREATE TABLE "GoogleRechargeReceipt" (
 "tokenHash" TEXT PRIMARY KEY, "productId" TEXT NOT NULL REFERENCES "GoogleRechargeProduct"("productId"),
 "userId" TEXT NOT NULL REFERENCES "User"("id"), "coins" BIGINT NOT NULL, "quantity" INTEGER NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
