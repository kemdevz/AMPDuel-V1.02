import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/apiClient'
import { isUuidLike } from '../lib/supabaseClient'
import { useAuth } from '../store/auth'
import CoinTipModal from './CoinTipModal'
import { notifications } from './Notifications'
import TipUserModal from './TipUserModal'

export const PROFILE_TIP_OPEN_EVENT = 'profile-tip:open'

function getRecipientId(recipient) {
  return String(
    recipient?.profile_id ||
    recipient?.user_id ||
    recipient?.uuid ||
    recipient?.id ||
    '',
  ).trim()
}

export default function ProfileTipManager({ gameMode = null }) {
  const user = useAuth((state) => state.user)
  const balance = useAuth((state) => state.balance)
  const setBalance = useAuth((state) => state.setBalance)
  const walletSelection = useAuth((state) => state.walletSelection)
  const setAuthModalOpen = useAuth((state) => state.setAuthModalOpen)
  const [recipient, setRecipient] = useState(null)
  const [amount, setAmount] = useState('')
  const [showInChat, setShowInChat] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const handleOpen = (event) => {
      const nextRecipient = event?.detail?.recipient || null
      if (!nextRecipient) return
      if (!useAuth.getState().user) {
        setAuthModalOpen(true)
        return
      }
      setRecipient(nextRecipient)
    }

    window.addEventListener(PROFILE_TIP_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(PROFILE_TIP_OPEN_EVENT, handleOpen)
  }, [setAuthModalOpen])

  const closeTip = () => {
    if (isSubmitting) return
    setAmount('')
    setShowInChat(false)
    setRecipient(null)
  }

  const validateRecipient = () => {
    const recipientId = getRecipientId(recipient)
    const senderId = String(user?.profile_id || user?.id || '').trim()
    if (!isUuidLike(recipientId)) {
      notifications.error("This user's profile could not be found.")
      return null
    }
    if (recipientId === senderId) {
      notifications.error('You cannot tip yourself.')
      return null
    }
    return recipientId
  }

  const handleItemTip = async (items) => {
    if (isSubmitting || !recipient || !Array.isArray(items) || items.length === 0) return
    const recipientId = validateRecipient()
    if (!recipientId) return
    const itemIds = items.map((item) => item?.id).filter(Boolean)
    if (itemIds.length === 0) {
      notifications.error('Select at least one item to tip.')
      return
    }

    setIsSubmitting(true)
    try {
      await apiRequest('/api/tips/items', {
        method: 'POST',
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          item_ids: itemIds,
          show_in_chat: false,
        }),
      })
      notifications.tippedUser(recipient.username || recipient.name || 'user')
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      setRecipient(null)
    } catch (error) {
      console.error('[ProfileTipManager] failed to tip inventory items', error)
      notifications.error(error?.message || 'Failed to tip items.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCoinTip = async () => {
    if (isSubmitting || !recipient || !user) return
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !Number.isInteger(numericAmount)) {
      notifications.invalidTipAmount()
      return
    }
    if (numericAmount > Number(balance || 0)) {
      notifications.insufficientCoins()
      return
    }
    const recipientId = validateRecipient()
    if (!recipientId) return

    setIsSubmitting(true)
    try {
      const result = await apiRequest('/api/tips/coins', {
        method: 'POST',
        body: JSON.stringify({
          recipient_profile_id: recipientId,
          amount: numericAmount,
          show_in_chat: showInChat,
        }),
      })
      setBalance(Number(result?.balance ?? (Number(balance || 0) - numericAmount)))
      window.dispatchEvent(new CustomEvent('wallet:updated'))
      notifications.tippedUser(recipient.username || recipient.name || 'user')
      setAmount('')
      setShowInChat(false)
      setRecipient(null)
    } catch (error) {
      console.error('[ProfileTipManager] failed to tip coins', error)
      notifications.error(error?.message || 'Failed to tip coins.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <TipUserModal
        isOpen={Boolean(recipient) && walletSelection === 'items'}
        recipient={recipient}
        gameMode={gameMode}
        isSubmitting={isSubmitting}
        onClose={closeTip}
        onSubmit={handleItemTip}
      />
      <CoinTipModal
        isOpen={Boolean(recipient) && walletSelection === 'coins'}
        recipient={recipient}
        amount={amount}
        showInChat={showInChat}
        isSubmitting={isSubmitting}
        onAmountChange={setAmount}
        onShowInChatChange={setShowInChat}
        onClose={closeTip}
        onSubmit={handleCoinTip}
      />
    </>
  )
}
