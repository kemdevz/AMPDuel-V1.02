import InventoryModal from './InventoryModal'

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
      }) => (
        <>
          <button
            type="button"
            className="amp-create-button"
            disabled={selectedAmount === 0 || isSubmitting}
            onClick={() => onSubmit?.(selectedItems)}
          >
            {isSubmitting ? 'Tipping' : 'Tip'}
          </button>
        </>
      )}
    />
  )
}
