-- Preserve previously configured Supporter badge as TOP 1. Explicit nulls win.
UPDATE "ProfileCardArtwork" p SET ranges=(
 SELECT COALESCE(jsonb_agg(CASE WHEN r->>'track'='SUPPORTER' THEN
   (r - 'badgeAssetId') || jsonb_build_object(
     'top1MedalAssetId', CASE WHEN r ? 'top1MedalAssetId' THEN r->'top1MedalAssetId' ELSE COALESCE(r->'badgeAssetId','null'::jsonb) END,
     'top2MedalAssetId',COALESCE(r->'top2MedalAssetId','null'::jsonb),
     'top3MedalAssetId',COALESCE(r->'top3MedalAssetId','null'::jsonb))
 ELSE r END ORDER BY ord),'[]'::jsonb)
 FROM jsonb_array_elements(p.ranges) WITH ORDINALITY AS rows(r,ord)
), revision=revision+1
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(p.ranges) r WHERE r->>'track'='SUPPORTER' AND r ? 'badgeAssetId');
