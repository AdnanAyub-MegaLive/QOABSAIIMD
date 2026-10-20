ALTER TABLE "PostComment" ADD COLUMN "parentId" TEXT;
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PostComment_parentId_idx" ON "PostComment"("parentId");
CREATE TABLE "PostCommentLike" ("commentId" TEXT NOT NULL, "userId" TEXT NOT NULL, CONSTRAINT "PostCommentLike_pkey" PRIMARY KEY ("commentId","userId"));
ALTER TABLE "PostCommentLike" ADD CONSTRAINT "PostCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostCommentLike" ADD CONSTRAINT "PostCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "PostCommentLike_userId_idx" ON "PostCommentLike"("userId");
