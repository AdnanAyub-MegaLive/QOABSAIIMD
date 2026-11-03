// Approved gift-XP policy. This creates a draft; publishing remains explicit.
export function giftXpEarningRules() {
  return ['PAID', 'BACKPACK', 'LUCKY', 'BLIND_BOX'].flatMap(source => [
    { track: 'USER', source, recipientType: 'ANY', basis: 'GIFT_XP', allowSelf: true, numerator: '1', denominator: '1', description: 'Configured Sender XP per gift × quantity. Self-gifts included.' },
    { track: 'CHARM', source, recipientType: 'HOST', basis: 'GIFT_XP', allowSelf: true, numerator: '1', denominator: '1', description: 'Configured Receiver XP per gift × quantity for Hosts/Talents with a linked account, plus self-gifts by any user.' },
  ]);
}

export function giftProgressionRule(rules, {track,source,recipientType,senderId,recipientId}) {
  const targetType=track==='USER'?'ANY':recipientType;
  const rule=rules.find(r=>r.track===track&&r.source===source&&r.recipientType===targetType);
  // Self-gifts use the configured Charm earning rate even for non-host accounts.
  // Ordinary gifts to non-hosts retain the existing eligibility policy.
  if(track==='CHARM'&&senderId&&senderId===recipientId) {
    return rules.find(r=>r.track==='CHARM'&&r.source===source&&r.recipientType==='HOST') ?? rule;
  }
  return rule;
}
