export function postVisibility(viewerId) {
  return {
    OR: [{ status: "APPROVED" }, { authorId: viewerId }],
    author: {
      deletedAt: null,
      status: "ACTIVE",
      blockedUsers: { none: { blockedId: viewerId } },
      blockedByUsers: { none: { blockerId: viewerId } },
    },
  };
}

export function postSelect(viewerId) {
  return {
    _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
    likes: { where: { userId: viewerId }, select: { userId: true } },
    shareCount: true,
    publicId: true,
    description: true,
    status: true,
    reviewReason: true,
    imageUrl: true,
    createdAt: true,
    author: {
      select: { id: true, publicId: true, name: true, profileImage: true, isOfficial: true },
    },
  };
}

export function postDto(post, viewerId, origin, perksByPublicId) {
  const perks = perksByPublicId.get(post.author.publicId);
  return {
    id: post.publicId,
    shareCount: post.shareCount ?? 0,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    liked: post.likes.length > 0,
    description: post.description,
    status: post.status,
    hasImage: Boolean(post.imageUrl),
    reviewReason: post.author.id === viewerId ? post.reviewReason : null,
    imageUrl: post.status === "APPROVED" && post.imageUrl ? new URL(post.imageUrl, origin).toString() : null,
    createdAt: post.createdAt.toISOString(),
    author: {
      publicId: post.author.publicId,
      fullName: post.author.name,
      profileImage: post.author.profileImage,
      isOfficial: Boolean(post.author.isOfficial),
      frameUrl: perks?.frameUrl ?? null,
      badgeUrl: perks?.badgeUrl ?? null,
    },
  };
}
