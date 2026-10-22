import {expect,it} from 'vitest';
import {uploadLibraryFilter} from './upload-library-filter.js';
it('excludes linked level backgrounds and their orphaned legacy uploads',()=>{
 expect(uploadLibraryFilter.levelTagBackgrounds).toEqual({none:{}});
 expect(uploadLibraryFilter.NOT).toEqual({fileName:'level-background.webp',distribution:'MANUAL',storeVisible:false});
});
