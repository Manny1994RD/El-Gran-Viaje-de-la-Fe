// Seed catalog taken from El_Gran_Viaje_de_la_Fe_MVP_Blueprint.xlsx.
// Values marked PROPUESTA in the blueprint are defaults an admin can change in Configuración.

export const SETTINGS = {
  season_name: 'El Gran Viaje de la Fe',
  season_start: '2026-10-11',
  season_end: '2026-10-31',
  group_target_size: 20,
  max_personal_base_weekly: 60,
  max_personal_bonus_weekly: 20,
  self_report_review: 'pending',
  baptism_milestone_additive: 50,
  keeping_service_extra: 100,
  class_ability_bonus: 5,
  season_frozen: false,
};

export const SETTING_TYPES = {
  season_name: 'text', season_start: 'date', season_end: 'date',
  group_target_size: 'integer', max_personal_base_weekly: 'integer',
  max_personal_bonus_weekly: 'integer', self_report_review: 'enum:pending,auto',
  baptism_milestone_additive: 'integer', keeping_service_extra: 'integer',
  class_ability_bonus: 'integer', season_frozen: 'bool',
};

// tag: tag that counts toward the world's special missions and obstacle.
export const WORLDS = [
  { id: 'W01', ord: 1, name_es: 'Bosque del Despertar', name_en: 'Forest of Awakening', star_target: 100, tag: 'encouragement', tag_target: 5, distinct_min: 0,
    obstacle_es: 'Niebla de la Distracción', obstacle_en: 'Fog of Distraction', rule_es: 'Completar 5 actos de ánimo verificados', rule_en: 'Complete 5 verified acts of encouragement',
    key_es: 'Llave del Despertar', key_en: 'Key of Awakening', reward_es: 'Pieza 1 de mapa', reward_en: 'Map piece 1',
    story_es: 'Una niebla espesa cubre el bosque y nos distrae del camino. Cada palabra de ánimo disipa un poco la niebla.',
    story_en: 'A thick fog covers the forest and distracts us from the path. Every word of encouragement clears a little of it.',
    start: '2026-10-11', end: '2026-10-13' },
  { id: 'W02', ord: 2, name_es: 'Lago de la Sabiduría', name_en: 'Lake of Wisdom', star_target: 200, tag: 'education_study', tag_target: 10, distinct_min: 3,
    obstacle_es: 'Enigma de los Cristales', obstacle_en: 'Riddle of the Crystals', rule_es: '10 estudios/prácticas; al menos 3 miembros distintos', rule_en: '10 studies/practices; at least 3 different members',
    key_es: 'Llave de la Sabiduría', key_en: 'Key of Wisdom', reward_es: 'Cristal', reward_en: 'Crystal',
    story_es: 'Los cristales del lago guardan la verdad. Solo se iluminan cuando estudiamos juntos la Palabra.',
    story_en: 'The lake crystals hold the truth. They only light up when we study the Word together.',
    start: '2026-10-14', end: '2026-10-17' },
  { id: 'W03', ord: 3, name_es: 'Puente de la Unidad', name_en: 'Bridge of Unity', star_target: 300, tag: 'teamwork', tag_target: 8, distinct_min: 8,
    obstacle_es: 'Puente Fragmentado', obstacle_en: 'Broken Bridge', rule_es: '8 misiones en equipo; 8 participantes distintos', rule_en: '8 team missions; 8 different participants',
    key_es: 'Llave de la Unidad', key_en: 'Key of Unity', reward_es: 'Puente reparado', reward_en: 'Bridge repaired',
    story_es: 'El puente está roto en pedazos. Solo podremos cruzar si trabajamos unidos, cada uno poniendo su tabla.',
    story_en: 'The bridge is broken into pieces. We can only cross if we work together, each one laying a plank.',
    start: '2026-10-18', end: '2026-10-20' },
  { id: 'W04', ord: 4, name_es: 'Montaña de la Perseverancia', name_en: 'Mountain of Perseverance', star_target: 400, tag: 'perseverance', tag_target: 12, distinct_min: 6,
    obstacle_es: 'Vientos del Desánimo', obstacle_en: 'Winds of Discouragement', rule_es: '12 acciones de apoyo/oración; 6 participantes', rule_en: '12 acts of support/prayer; 6 participants',
    key_es: 'Llave de la Perseverancia', key_en: 'Key of Perseverance', reward_es: 'Bandera', reward_en: 'Banner',
    story_es: 'Fuertes vientos soplan en la montaña. Con oración y apoyo mutuo seguimos subiendo sin rendirnos.',
    story_en: 'Strong winds blow on the mountain. With prayer and mutual support we keep climbing without giving up.',
    start: '2026-10-21', end: '2026-10-24' },
  { id: 'W05', ord: 5, name_es: 'Jardín de los Frutos', name_en: 'Garden of Fruits', star_target: 500, tag: 'preaching_followup', tag_target: 15, distinct_min: 6,
    obstacle_es: 'Jardín Dormido', obstacle_en: 'Sleeping Garden', rule_es: '15 actividades de predicación o seguimiento; 6 participantes', rule_en: '15 preaching or follow-up activities; 6 participants',
    key_es: 'Llave de los Frutos', key_en: 'Key of Fruits', reward_es: 'Semilla luminosa', reward_en: 'Glowing seed',
    story_es: 'El jardín duerme esperando semillas. Cada predicación y seguimiento hace brotar nueva vida.',
    story_en: 'The garden sleeps, waiting for seeds. Every preaching and follow-up brings new life.',
    start: '2026-10-25', end: '2026-10-28' },
  { id: 'W06', ord: 6, name_es: 'Ciudad de las Promesas', name_en: 'City of Promises', star_target: 0, tag: 'five_paths', tag_target: 5, distinct_min: 3,
    obstacle_es: 'Puertas de la Victoria', obstacle_en: 'Gates of Victory', rule_es: 'Una actividad aprobada en cada área: conocimiento, ánimo, servicio, predicación y unidad', rule_en: 'One approved activity in each area: knowledge, encouragement, service, preaching and unity',
    key_es: 'Victoria Compartida', key_en: 'Shared Victory', reward_es: 'Victoria', reward_en: 'Victory',
    story_es: 'Las puertas de la ciudad se abren con cinco caminos. Juntos llegamos a la ciudad prometida.',
    story_en: 'The city gates open with five paths. Together we reach the promised city.',
    start: '2026-10-29', end: '2026-10-31' },
];

// PRE04/PRE05 have no daily cap: they are limited to once per anonymous contact instead,
// so two real baptisms on the same day are never lost.
// contact: none | pre02 (optional token) | pre04 (new baptism milestone) | pre05 (after pre04)
// confirm: a checkbox the member must tick (e.g. whole EduLMS course finished)
const m = (id, category, name_es, name_en, points, tags, daily_cap, freq_es, freq_en, extra = {}) =>
  ({ id, category, name_es, name_en, points, tags, daily_cap, freq_es, freq_en, kind: 'base', min_participants: 1, contact: 'none', confirm: 0, exempt_cap: 0, ...extra });

export const MISSIONS = [
  m('PRE01', 'preaching', 'Predicación simple', 'Simple preaching', 1, ['preaching_followup'], null, 'por persona distinta alcanzada', 'per different person reached'),
  m('PRE02', 'preaching', 'Predicación significativa', 'Meaningful preaching', 5, ['preaching_followup'], 1, 'por hito (adicional a la simple)', 'per milestone (on top of simple)', { contact: 'pre02' }),
  m('PRE03', 'preaching', 'Estudio bíblico con invitado', 'Bible study with a guest', 10, ['education_study', 'preaching_followup'], null, 'por sesión', 'per session'),
  m('PRE04', 'preaching', 'Fruto / bautismo', 'Fruit / baptism', 50, ['preaching_followup'], null, 'una vez por invitado', 'once per guest', { contact: 'pre04', exempt_cap: 1 }),
  m('PRE05', 'preaching', 'Fruto que guarda servicio', 'Fruit that keeps worship', 100, ['preaching_followup'], null, 'una vez por invitado, después del bautismo', 'once per guest, after baptism', { contact: 'pre05', exempt_cap: 1 }),
  m('EDU01', 'education', 'Terminar curso EduLMS', 'Finish an EduLMS course', 15, ['education_study'], 1, 'por curso completo', 'per complete course', { confirm: 1 }),
  m('EDU02', 'education', 'Firma de sermón', 'Sermon signature', 5, ['education_study'], null, 'por firma válida', 'per valid signature'),
  m('EDU03', 'education', 'Firma de AGE/GA', 'AGE/GA signature', 8, ['education_study'], null, 'por firma válida (AGE = GA)', 'per valid signature (AGE = GA)'),
  m('AP01', 'shepherd', 'CAP. de Padre', "Father's CAP.", 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP02', 'shepherd', 'CAP. de primer pastor', 'First pastor CAP.', 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP03', 'shepherd', 'Video sermón', 'Sermon video', 5, ['education_study'], 1, 'una actividad / día', 'one activity / day'),
  m('AP04', 'shepherd', 'Escuela de día de reposo', 'Sabbath school', 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP05', 'shepherd', 'Misión en línea', 'Online mission', 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP06', 'shepherd', 'Biblia', 'Bible', 5, ['education_study'], 1, 'una actividad / día', 'one activity / day'),
  m('AP07', 'shepherd', 'Mi página', 'My page', 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP08', 'shepherd', 'Palabras de Madre', "Mother's words", 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP09', 'shepherd', 'Mis notas', 'My notes', 5, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('AP10', 'shepherd', 'Lecciones de Madre', "Mother's lessons", 5, ['education_study'], 1, 'una actividad / día', 'one activity / day'),
  m('SER01', 'service', 'Oración', 'Prayer', 3, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('SER02', 'service', 'Dar ánimos', 'Give encouragement', 5, ['encouragement', 'perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('SER03', 'service', 'Ayudar a otros a avanzar', 'Help others move forward', 10, ['teamwork', 'encouragement'], 1, 'una actividad / día', 'one activity / day'),
  m('SER04', 'service', 'Preparación de Sion', 'Zion preparation', 10, ['teamwork'], 1, 'una actividad / día', 'one activity / day'),
  m('SER05', 'service', 'Carta a Madre', 'Letter to Mother', 10, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  m('SER06', 'service', 'Fragancia', 'Fragrance', 5, ['encouragement'], 1, 'una actividad / día', 'one activity / day'),
  m('SER07', 'service', 'Misión especial', 'Special mission', 15, ['teamwork'], 1, 'una actividad / día', 'one activity / day'),
  m('SER08', 'service', 'Oración diaria app', 'Daily prayer app', 3, ['perseverance'], 1, 'una actividad / día', 'one activity / day'),
  // Special missions (sheet 08)
  m('SP01', 'preaching', 'Lentes de Explorador', "Explorer's Glasses", 5, ['preaching_followup'], 1, 'Conversar con alguien que use lentes, si surge naturalmente', 'Talk with someone who wears glasses, if it comes up naturally', { kind: 'special' }),
  m('SP02', 'preaching', 'Ruta de la Salud', 'Health Route', 5, ['preaching_followup'], 1, 'Invitación respetuosa a un profesional de salud, si se encuentra casualmente', 'A respectful invitation to a health professional, if you meet one by chance', { kind: 'special' }),
  m('SP03', 'preaching', 'Las Tres Calles', 'The Three Streets', 10, ['preaching_followup', 'teamwork'], 1, 'Equipo visita tres zonas públicas autorizadas', 'Team visits three authorized public areas', { kind: 'special', min_participants: 2 }),
  m('SP04', 'education', 'Puerta de Sabiduría', 'Door of Wisdom', 10, ['education_study', 'teamwork'], 1, 'Equipo completa dos prácticas de temas distintos', 'Team completes two practices on different topics', { kind: 'special', min_participants: 2 }),
  m('SP05', 'service', 'Cadena de Luz', 'Chain of Light', 15, ['encouragement', 'teamwork'], 1, 'Cuatro miembros se dan ánimo en cadena', 'Four members encourage each other in a chain', { kind: 'special', min_participants: 4 }),
  m('SP06', 'service', 'Guardianes de Sion', 'Guardians of Zion', 15, ['teamwork'], 1, 'Organizar preparación por equipos', 'Organize preparation in teams', { kind: 'special', min_participants: 3 }),
  m('SP07', 'unity', 'Puente del Reencuentro', 'Bridge of Reunion', 10, ['teamwork', 'encouragement'], 1, 'Invitar a un compañero a colaborar en una misión', 'Invite a companion to work together on a mission', { kind: 'special', min_participants: 2 }),
  m('SP08', 'education', 'Tesoro de las Palabras', 'Treasure of Words', 10, ['education_study', 'teamwork'], 1, 'Encontrar un pasaje y compartir la enseñanza en grupo', 'Find a passage and share the teaching in a group', { kind: 'special', min_participants: 2 }),
  m('SP09', 'shepherd', 'Ruta de los Nuevos', 'Newcomers Route', 10, ['education_study', 'teamwork'], 1, 'Ayudar a alguien a usar un recurso de estudio', 'Help someone use a study resource', { kind: 'special', min_participants: 2 }),
  m('SP10', 'service', 'Misión del Buen Vecino', 'Good Neighbor Mission', 15, ['teamwork'], 1, 'Pequeño acto de ayuda comunitaria autorizado', 'A small authorized act of community help', { kind: 'special', min_participants: 2 }),
  m('SP11', 'unity', 'Puente de las Voces', 'Bridge of Voices', 15, ['encouragement', 'teamwork'], 1, 'Equipo de tres comparte una reflexión o ánimo', 'A team of three shares a reflection or encouragement', { kind: 'special', min_participants: 3 }),
  m('SP12', 'unity', 'Cartógrafos del Reino', 'Kingdom Cartographers', 20, ['teamwork', 'education_study', 'encouragement', 'preaching_followup'], 1, 'Una actividad de las cuatro categorías principales', 'One activity from each of the four main categories', { kind: 'special', min_participants: 3 }),
  // Mystery cards (sheet 07): points = bonus stars; revealed by admin.
  m('CARD01', 'card', 'Luz Compartida', 'Shared Light', 5, ['encouragement'], 1, 'Animar a otro miembro', 'Encourage another member', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD02', 'card', 'Dos Caminantes', 'Two Walkers', 10, ['teamwork'], 1, 'Completar una misión en pareja', 'Complete a mission in pairs', { kind: 'card', reward_scope: 'each_member', min_participants: 2 }),
  m('CARD03', 'card', 'Pergamino Antiguo', 'Ancient Scroll', 10, ['education_study'], 1, 'Aprender y explicar un pasaje', 'Learn and explain a passage', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD04', 'card', 'Sendero Oculto', 'Hidden Trail', 10, ['preaching_followup'], 1, 'Participar en predicación', 'Take part in preaching', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD05', 'card', 'Mano Amiga', 'Helping Hand', 10, ['teamwork'], 1, 'Ayudar a preparar Sion', 'Help prepare Zion', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD06', 'card', 'Eco del Ánimo', 'Echo of Encouragement', 15, ['encouragement'], 1, '3 actos de ánimo realizados por el equipo', '3 acts of encouragement by the team', { kind: 'card', reward_scope: 'group_only', min_participants: 2 }),
  m('CARD07', 'card', 'Cristal de la Verdad', 'Crystal of Truth', 10, ['education_study'], 1, 'Practicar un tema bíblico juntos', 'Practice a Bible topic together', { kind: 'card', reward_scope: 'each_member', min_participants: 2 }),
  m('CARD08', 'card', 'Invitación Misteriosa', 'Mysterious Invitation', 10, ['preaching_followup'], 1, 'Invitar a alguien a un estudio (cuenta la invitación, no la aceptación)', 'Invite someone to a study (the invitation counts, not the answer)', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD09', 'card', 'Cofre de la Unidad', 'Chest of Unity', 20, ['teamwork'], 1, '3 misiones cooperativas', '3 cooperative missions', { kind: 'card', reward_scope: 'group_only', min_participants: 2 }),
  m('CARD10', 'card', 'Llama Encendida', 'Burning Flame', 15, ['mixed'], 1, '3 categorías de misión en una semana', '3 mission categories in one week', { kind: 'card', reward_scope: 'bonus' }),
  m('CARD11', 'card', 'Guardianes del Camino', 'Guardians of the Path', 10, ['teamwork'], 1, 'Acompañar a un miembro en una misión', 'Accompany a member on a mission', { kind: 'card', reward_scope: 'each_member', min_participants: 2 }),
  m('CARD12', 'card', 'Tesoro del Reino', 'Kingdom Treasure', 30, ['world'], 1, 'Terminar el desafío del territorio', 'Finish the territory challenge', { kind: 'card', reward_scope: 'group_only', min_participants: 3 }),
];

// The class ability gives +bonus to each participant of a joint mission whose tags match.
export const CLASSES = [
  { id: 'CLS01', name_es: 'Sabio de la Verdad', name_en: 'Sage of Truth', style_es: 'Estudio', style_en: 'Study', tag: 'education_study',
    ability_es: '+5 a cada participante de una práctica bíblica conjunta (1 por semana)', ability_en: '+5 to each participant of a joint Bible practice (1 per week)' },
  { id: 'CLS02', name_es: 'Mensajero de Esperanza', name_en: 'Messenger of Hope', style_es: 'Predicación', style_en: 'Preaching', tag: 'preaching_followup',
    ability_es: '+5 a cada participante de una predicación conjunta (1 por semana)', ability_en: '+5 to each participant of a joint preaching (1 per week)' },
  { id: 'CLS03', name_es: 'Guardián de la Unidad', name_en: 'Guardian of Unity', style_es: 'Cooperación', style_en: 'Cooperation', tag: 'teamwork',
    ability_es: '+5 a cada participante de una misión de apoyo mutuo (1 por semana)', ability_en: '+5 to each participant of a mutual-support mission (1 per week)' },
  { id: 'CLS04', name_es: 'Portador de Ánimo', name_en: 'Bearer of Encouragement', style_es: 'Ánimo', style_en: 'Encouragement', tag: 'encouragement',
    ability_es: '+5 a cada participante de una misión de ánimo conjunta (1 por semana)', ability_en: '+5 to each participant of a joint encouragement mission (1 per week)' },
  { id: 'CLS05', name_es: 'Constructor de Sion', name_en: 'Builder of Zion', style_es: 'Servicio', style_en: 'Service', tag: 'teamwork', category: 'service',
    ability_es: '+5 a cada participante en preparación de Sion (1 por semana)', ability_en: '+5 to each participant in Zion preparation (1 per week)' },
];

export const LEVELS = [
  { level: 1, min_xp: 0, title_es: 'Explorador', title_en: 'Explorer', prize_es: 'Brújula de inicio', prize_en: 'Starter compass', cosmetic: 'compass' },
  { level: 2, min_xp: 50, title_es: 'Caminante', title_en: 'Walker', prize_es: 'Insignia del Camino', prize_en: 'Path badge', cosmetic: 'badge' },
  { level: 3, min_xp: 100, title_es: 'Guardia de la Luz', title_en: 'Guard of Light', prize_es: 'Marco luminoso', prize_en: 'Glowing frame', cosmetic: 'frame' },
  { level: 4, min_xp: 175, title_es: 'Viajero Valiente', title_en: 'Brave Traveler', prize_es: 'Efecto de personaje', prize_en: 'Character aura', cosmetic: 'aura' },
  { level: 5, min_xp: 250, title_es: 'Guardián del Camino', title_en: 'Guardian of the Path', prize_es: 'Título especial', prize_en: 'Special title', cosmetic: 'title' },
  { level: 6, min_xp: 350, title_es: 'Héroe de la Unidad', title_en: 'Hero of Unity', prize_es: 'Corona de unidad', prize_en: 'Unity crown', cosmetic: 'crown' },
];

export const levelFor = (xp) => LEVELS.reduce((acc, l) => (xp >= l.min_xp ? l : acc), LEVELS[0]);

// Five paths for the final world: each approved claim may cover several.
export function pathsOf(def) {
  const p = new Set();
  if (def.category === 'education' || def.tags.includes('education_study')) p.add('knowledge');
  if (def.tags.includes('encouragement')) p.add('encouragement');
  if (def.category === 'service') p.add('service');
  if (def.category === 'preaching' || def.tags.includes('preaching_followup')) p.add('preaching');
  if (def.tags.includes('teamwork') || def.category === 'unity') p.add('unity');
  return [...p];
}
