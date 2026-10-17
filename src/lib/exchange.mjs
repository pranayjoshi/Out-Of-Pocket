const transitions = {
  reserved: { AUTHORIZE: "authorized", CANCEL: "canceled" },
  authorized: { VERIFY: "verified", CANCEL: "canceled" },
  verified: { INSPECT: "inspected", CANCEL: "canceled" },
  inspected: { PAY: "paid", CANCEL: "canceled" },
  paid: { REPORT: "case-open" },
  "case-open": { APPROVE_RETURN: "refund-pending" },
  "refund-pending": { CONFIRM_REFUND: "refunded" },
  canceled: {},
  refunded: {},
};
export function transitionExchange(state, event) {
  return transitions[state]?.[event] ?? state;
}
export function moneyStatus(state, amount) {
  if (amount === 0)
    return { buyer: "No payment required", seller: "Free item · no transfer" };
  if (state === "reserved")
    return { buyer: "No payment collected", seller: "Not transferred" };
  if (["authorized", "verified", "inspected"].includes(state))
    return {
      buyer: `$${amount} temporary card hold`,
      seller: "Not transferred",
    };
  if (state === "canceled")
    return { buyer: "No payment captured", seller: "Not transferred" };
  if (state === "case-open")
    return {
      buyer: `$${amount} charged · case open`,
      seller: "Unreleased transfer paused",
    };
  if (state === "refund-pending")
    return { buyer: `$${amount} refund pending`, seller: "Not transferred" };
  if (state === "refunded")
    return { buyer: `$${amount} refund confirmed`, seller: "Not transferred" };
  if (state === "paid")
    return {
      buyer: `$${amount} payment completed`,
      seller: `$${amount} transfer scheduled`,
    };
  return {
    buyer: "Checking payment status",
    seller: "Checking transfer status",
  };
}
