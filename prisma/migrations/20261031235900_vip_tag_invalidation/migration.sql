CREATE OR REPLACE FUNCTION portal_vip_tag_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP <> 'DELETE' AND NEW.category = 'USER_TAGS') OR
     (TG_OP <> 'INSERT' AND OLD.category = 'USER_TAGS') THEN
    PERFORM pg_notify('portal_confirmed_realtime', 'vip_tags');
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER portal_vip_tag_invalidation AFTER INSERT OR UPDATE OR DELETE ON "UploadAsset"
FOR EACH ROW EXECUTE FUNCTION portal_vip_tag_invalidation();
