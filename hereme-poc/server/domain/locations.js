'use strict';
const {fail}=require('./errors');
function createLocationService(db,config){
  const enabled=()=>{if(!config.enableLocations)fail('LOCATIONS_DISABLED','Områder er ikke aktivert.',404);};
  function list(){enabled();return db.prepare(`SELECT a.id,a.kind,a.parent_id,a.name,a.geometry_version FROM areas a
    WHERE a.active=1 ORDER BY CASE a.kind WHEN 'country' THEN 0 WHEN 'fylke' THEN 1 WHEN 'kommune' THEN 2 ELSE 3 END,a.name`).all();}
  function geometry(version){enabled();const rows=db.prepare(`SELECT a.id,a.kind,a.parent_id,a.name,g.geojson,g.version,g.source_url,g.license
    FROM areas a JOIN area_geometries g ON g.area_id=a.id WHERE a.active=1 AND g.version=COALESCE(?,a.geometry_version)`).all(version||null);
    if(!rows.length)fail('GEOMETRY_UNAVAILABLE','Ingen godkjent områdegeometri er installert.',503);
    return {type:'FeatureCollection',features:rows.map(row=>({type:'Feature',id:row.id,properties:{name:row.name,kind:row.kind,parent_id:row.parent_id,version:row.version,source_url:row.source_url,license:row.license},geometry:JSON.parse(row.geojson)}))};
  }
  function subscriptions(user){enabled();return db.prepare('SELECT a.* FROM area_subscriptions s JOIN areas a ON a.id=s.area_id WHERE s.user_id=? ORDER BY a.name').all(user.id);}
  function setSubscriptions(user,ids){enabled();if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'))fail('INVALID_AREAS','Ugyldig områdeutvalg.');const unique=[...new Set(ids)];if(unique.length){const placeholders=unique.map(()=>'?').join(',');if(db.prepare(`SELECT count(*) n FROM areas WHERE active=1 AND id IN (${placeholders})`).get(...unique).n!==unique.length)fail('INVALID_AREAS','Ett eller flere områder finnes ikke.');}
    db.exec('BEGIN IMMEDIATE');try{db.prepare('DELETE FROM area_subscriptions WHERE user_id=?').run(user.id);const insert=db.prepare('INSERT INTO area_subscriptions(user_id,area_id) VALUES(?,?)');for(const id of unique)insert.run(user.id,id);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}return subscriptions(user);
  }
  return {list,geometry,subscriptions,setSubscriptions};
}
module.exports={createLocationService};
