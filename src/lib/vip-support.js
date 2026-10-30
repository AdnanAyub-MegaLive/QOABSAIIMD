export function isVipPrioritySupport(conversation, vipByUser) {
  return conversation.kind === 'DIRECT' &&
    conversation.participants.some(p => p.user.appRoles.some(role => ['CS','CS_LEADER'].includes(role))) &&
    conversation.participants.some(p => vipByUser.get(p.user.id)?.vipPrivileges.includes('CUSTOMER_SERVICE'));
}
