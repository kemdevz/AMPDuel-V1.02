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
            className="_withdrawButton_cpcgp_387 tipUserInventoryButton"
            disabled={selectedAmount === 0 || isSubmitting}
            onClick={() => onSubmit?.(selectedItems)}
          >
            <strong>Tip</strong>
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
