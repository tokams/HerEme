'use strict';
const {ids, get}=require('../public/themes');
const seedCategories=require('../seed/categories.json');

function legacyCategory(room, type) {
  if(room==='sporsmal') return 'question';
  if(room==='ryktetorget') return 'opinion';
  if(room==='hva-skjer'||type==='link') return 'tip';
  return 'story';
}

function parseDesign(input, defaultCategory='story') {
  const category=input.category===undefined?defaultCategory:input.category;
  get(category);
  if(input.poster_style!==undefined&&input.poster_style!==category)
    throw new Error('Plakatstilen må følge kategorien.');
  const numeric=(key, defaultValue, min, max)=>{
    const raw=input[key];
    const value=raw===undefined?defaultValue:Number(raw);
    if((raw!==undefined&&!['number','string'].includes(typeof raw))||raw===''||!Number.isFinite(value)||value<min||value>max)
      throw new Error('Ugyldig bildeutsnitt: '+key);
    return value;
  };
  const text_position=input.text_position??'auto';
  if(!['auto','top','center','bottom'].includes(text_position))throw new Error('Ugyldig tekstplassering.');
  return {category, text_position, image_zoom:numeric('image_zoom',1,1,3),
    image_x:numeric('image_x',50,0,100), image_y:numeric('image_y',50,0,100)};
}

function insertDesign(db, id, design) {
  db.prepare('INSERT INTO post_design(post_id,category,image_zoom,image_x,image_y,text_position) VALUES(?,?,?,?,?,?)')
    .run(id,design.category,design.image_zoom,design.image_x,design.image_y,design.text_position??'auto');
}

// Only missing metadata is mapped. Imported room changes never overwrite a chosen category.
function backfillDesigns(db) {
  const missing=db.prepare(`SELECT p.id,p.type,r.slug,i.seed_key FROM posts p
    LEFT JOIN rooms r ON r.id=p.room_id LEFT JOIN hereme_demo_imports i ON i.post_id=p.id
    LEFT JOIN post_design d ON d.post_id=p.id WHERE d.post_id IS NULL`).all();
  for(const post of missing)
    insertDesign(db,post.id,parseDesign({category:seedCategories[post.seed_key]||legacyCategory(post.slug,post.type)}));
}
module.exports={ids,legacyCategory,parseDesign,insertDesign,backfillDesigns};
