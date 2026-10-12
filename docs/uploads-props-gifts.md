# Uploads: Props and Gifts

The legacy Prop Mall Add and Gift List Add forms were inspected read-only. The new UI follows their separation while retaining MegaLive styling and current server contracts.

- Props: category tabs, name/details/tags, validated media, acquisition method, Coin price, store visibility, validity period, user grants and active state.
- Gifts: dedicated catalogue, type/status/name filters, name/details/tags, media and optional static icon/poster, Coin price, mandatory sender and receiver XP, existing gift types and reward controls. Gifts are not equipped props.
- Other Assets: banners, medals, role/agency artwork, campaign widgets and music remain accessible.
- Live-video gifts remain in Live Management; no data was moved, deleted or reclassified.

Legacy-only controls (VAP JSON, nine-patch renderer, relationship cards/gifts, level-grant qualification, combo toggles) are not added as nonfunctional inputs. Existing MIME validation and financial rules remain unchanged. Full legacy feature parity is not claimed.
## Consolidated catalogue

Props now contains exactly Frames, Profile Dresses, Entrance Strip, Rides, Badges, Chat Boxes, Room Backgrounds, Seat Styles and Business Cards. Medals and Role Artwork migrate to BADGES, retaining asset IDs, assignments and medal/role references. TAIL_LIGHTS migrates to ENTRANCES; existing canonical equipped slots win conflicts while ownership is preserved. Supporting media stays under Other Assets.

Apply migration 20261012143000_consolidate_upload_categories before running the updated portal. Back up the database first. No media files are deleted.

Gifts require giftCategory on creation: NORMAL, LUCKY, VIP, CP_GIFT, COUNTRY or CUSTOMIZED. The mobile gift catalogue returns these six categories, including empty lists. Gift DTO category is the placement and giftTier remains the behavior selector. Existing Classic/Premium gifts map to Normal; blind boxes map to Customized while retaining blind-box behavior. Category alone does not introduce CP eligibility or country restrictions. Mobile should use giftTier to choose its existing special-send flow.

