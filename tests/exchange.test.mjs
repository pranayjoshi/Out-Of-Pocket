import test from "node:test";
import assert from "node:assert/strict";
import { transitionExchange, moneyStatus } from "../src/lib/exchange.mjs";

test("identifying a partner does not accept the item or capture payment", () => {
  assert.equal(transitionExchange("authorized", "VERIFY"), "verified");
  assert.equal(transitionExchange("verified", "PAY"), "verified");
  assert.equal(moneyStatus("verified", 40).buyer, "$40 temporary card hold");
});
test("payment requires the full inspection path", () => {
  let state = "reserved";
  for (const event of ["AUTHORIZE", "VERIFY", "INSPECT", "PAY"])
    state = transitionExchange(state, event);
  assert.equal(state, "paid");
  assert.equal(transitionExchange("paid", "PAY"), "paid");
});
test("rejection cancels before capture and terminal orders cannot be charged", () => {
  for (const state of ["reserved", "authorized", "verified", "inspected"])
    assert.equal(transitionExchange(state, "CANCEL"), "canceled");
  assert.equal(transitionExchange("canceled", "PAY"), "canceled");
  assert.equal(moneyStatus("canceled", 40).buyer, "No payment captured");
});
test("a report does not grant a refund; submitted refunds are not bank confirmation", () => {
  assert.equal(transitionExchange("paid", "REPORT"), "case-open");
  assert.equal(transitionExchange("case-open", "CONFIRM_REFUND"), "case-open");
  assert.equal(
    transitionExchange("case-open", "APPROVE_RETURN"),
    "refund-pending",
  );
  assert.equal(moneyStatus("refund-pending", 40).buyer, "$40 refund pending");
  assert.equal(
    transitionExchange("refund-pending", "CONFIRM_REFUND"),
    "refunded",
  );
});

test("free items do not claim card holds, charges, or transfers", () => {
  for (const state of [
    "reserved",
    "authorized",
    "verified",
    "inspected",
    "paid",
  ]) {
    assert.equal(moneyStatus(state, 0).buyer, "No payment required");
    assert.equal(moneyStatus(state, 0).seller, "Free item · no transfer");
  }
});
test("unknown payment states never claim successful payment", () => {
  assert.equal(moneyStatus("unknown", 40).buyer, "Checking payment status");
  assert.equal(transitionExchange("unknown", "PAY"), "unknown");
});
