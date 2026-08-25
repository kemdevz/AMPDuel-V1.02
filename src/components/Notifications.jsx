// Notifications are intentionally disabled. Keep this small compatibility
// surface so feature code can report outcomes without rendering toast UI.
export function showNotification() {
  return null
}

showNotification.error = showNotification
showNotification.success = showNotification
showNotification.info = showNotification

export const notify = showNotification

export const notifications = Object.freeze({
  insufficientCoins: showNotification,
  invalidPromoCode: showNotification,
  promoCodeRequired: showNotification,
  signInToRedeem: showNotification,
  promoCodeRedeemed: showNotification,
  promoCodeFailed: showNotification,
  invalidTipAmount: showNotification,
  coinflipCreateFailed: showNotification,
  inventoryWithdrawFailed: showNotification,
  withdrawalCancelFailed: showNotification,
  loginFailed: showNotification,
  selectedValueTooHigh: showNotification,
  autoSelected: showNotification,
  joinedGame: showNotification,
  joinFailed: showNotification,
  tippedUser: showNotification,
  error: showNotification,
  success: showNotification,
  info: showNotification,
})
