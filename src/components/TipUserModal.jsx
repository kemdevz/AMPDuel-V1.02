import InventoryModal from './InventoryModal'

const COIN_ICON = '/bobux.png'

function formatNumber(value) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue.toLocaleString() : '0'
}

export default function TipUserModal({
  isOpen,
  recipient,
  gameMode = null,
  isSubmitting = false,
  onClose,
  onSubmit,
}) {
  if (!recipient) return null

  const username = recipient.username || recipient.name || 'user'

  return (
    <InventoryModal
      isOpen={isOpen}
      onClose={onClose}
      gameMode={gameMode}
      ariaLabel={`Tip items to ${username}`}
      footer={({
        selectedItems,
        selectedAmount,
        selectedValue,
      }) => (
        <>
          <button
            type="button"
            className="_withdrawButton_cpcgp_387 tipUserInventoryButton"
            disabled={selectedAmount === 0 || isSubmitting}
            onClick={() => onSubmit?.(selectedItems)}
          >
            <strong className="_pcvalue_cpcgp_471">
              {isSubmitting ? 'Sending...' : 'Tip'}
              <span className="_walletWithdrawSep_cpcgp_local" />
              <span className="_walletCoinValue_cpcgp_local">
                <img src={COIN_ICON} alt="Bobux" />
                <span className="_pcvalue_cpcgp_471">{formatNumber(selectedValue)}</span>
              </span>
            </strong>
            <strong className="_mobilevalue_cpcgp_472">
              {isSubmitting ? 'Sending...' : `Tip ${username}`}
              <span className="_walletWithdrawSep_cpcgp_local" />
              <span className="_walletCoinValue_cpcgp_local">
                <img src={COIN_ICON} alt="Bobux" />
                <span className="_mobilevalue_cpcgp_472">{formatNumber(selectedValue)}</span>
              </span>
            </strong>
          </button>
          <style>{`
            .tipUserInventoryButton {
              font-family: Poppins, sans-serif;
            }
          `}</style>
        </>
      )}
    />
  )
}
