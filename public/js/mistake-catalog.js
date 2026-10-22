/**
 * Catálogo oficial de errores de simulación agrupados por dimensiones / ejes clave.
 * Utilizado para clasificación, agregación y representación en el Radar de Competencias.
 */

export const MISTAKE_DIMENSIONS = {
  EJE_1: {
    id: 1,
    key: 'normas_trafico',
    nombre: 'Respeto a las Normas de Tráfico y Señalización',
    shortName: 'Normas de Tráfico',
    icono: '🚦',
    color: '#38bdf8'
  },
  EJE_2: {
    id: 2,
    key: 'dinamica_seguridad',
    nombre: 'Control de la Dinámica y Seguridad Vial',
    shortName: 'Dinámica y Seguridad',
    icono: '🛡️',
    color: '#ef4444'
  },
  EJE_3: {
    id: 3,
    key: 'eficiencia_motor',
    nombre: 'Eficiencia y Gestión del Motor (RPM y Térmica)',
    shortName: 'Eficiencia de Motor',
    icono: '⚙️',
    color: '#10b981'
  },
  EJE_4: {
    id: 4,
    key: 'transmision_embrague',
    nombre: 'Técnica de Transmisión y Uso del Embrague',
    shortName: 'Transmisión y Embrague',
    icono: '🕹️',
    color: '#f59e0b'
  },
  EJE_5: {
    id: 5,
    key: 'arranque_preparacion',
    nombre: 'Procedimientos de Arranque y Preparación',
    shortName: 'Arranque y Preparación',
    icono: '🔑',
    color: '#a855f7'
  }
};

/**
 * Catálogo de errores con su eje asignado, variaciones y alias para matching flexible.
 */
export const MISTAKE_CATALOG = [
  // ==========================================
  // EJE 1: Respeto a las Normas de Tráfico y Señalización
  // ==========================================
  {
    nombre: 'Acelerar para saltarse un semáforo en Ámbar',
    ejeId: 1,
    alias: ['acelerar para saltarse un semaforo en ambar', 'acelerar semaforo ambar']
  },
  {
    nombre: 'Invadir el acotamiento',
    ejeId: 1,
    alias: ['invadir el acotamiento', 'invadir acotamiento']
  },
  {
    nombre: 'Invadir un carril de sentido contrario rebasando una línea continua',
    ejeId: 1,
    alias: [
      'invadir un carril de sentido contrario rebasando una linea continua',
      'invadir un carril de sentido contrario',
      'invadir carril sentido contrario'
    ]
  },
  {
    nombre: 'No conectar el alumbrado de cruce en situaciones de baja visibilidad',
    ejeId: 1,
    alias: [
      'no conectar el alumbrado de cruce en situaciones de baja visibilidad',
      'no conectar el alumbrado en situaciones de baja visibilidad',
      'no encender luces baja visibilidad',
      'alumbrado baja visibilidad'
    ]
  },
  {
    nombre: 'No parar en un stop',
    ejeId: 1,
    alias: ['no parar en un stop', 'no hacer alto en stop', 'no parar en stop']
  },
  {
    nombre: 'No poner la luz direccional al salir de la rotonda',
    ejeId: 1,
    alias: ['no poner la luz direccional al salir de la rotonda', 'direccional salir rotonda']
  },
  {
    nombre: 'No poner la luz direccional derecha para el cambio de carril',
    ejeId: 1,
    alias: [
      'no poner la luz direccional derecha para el cambio de carril',
      'direccional derecha cambio carril',
      'no poner direccional derecha'
    ]
  },
  {
    nombre: 'No poner la luz direccional en la incorporación',
    ejeId: 1,
    alias: ['no poner la luz direccional en la incorporacion', 'direccional incorporacion']
  },
  {
    nombre: 'No poner la luz direccional en la salida',
    ejeId: 1,
    alias: ['no poner la luz direccional en la salida', 'direccional salida']
  },
  {
    nombre: 'No poner la luz direccional izquierdo para el cambio de carril',
    ejeId: 1,
    alias: [
      'no poner la luz direccional izquierdo para el cambio de carril',
      'no poner la luz direccional izquierda para el cambio de carril',
      'direccional izquierda cambio carril',
      'no poner direccional izquierdo'
    ]
  },
  {
    nombre: 'No respetar un ceda el paso',
    ejeId: 1,
    alias: ['no respetar un ceda el paso', 'no respetar ceda el paso']
  },
  {
    nombre: 'Parar en un ceda sin necesidad',
    ejeId: 1,
    alias: ['parar en un ceda sin necesidad', 'parar en ceda sin necesidad']
  },
  {
    nombre: 'Pisar el acotamiento derecho',
    ejeId: 1,
    alias: ['pisar el acotamiento derecho', 'pisar acotamiento derecho']
  },
  {
    nombre: 'Pisar una línea continua',
    ejeId: 1,
    alias: ['pisar una linea continua', 'pisar linea continua']
  },
  {
    nombre: 'Saltarse un semáforo en Ámbar',
    ejeId: 1,
    alias: ['saltarse un semaforo en ambar', 'semaforo en ambar', 'saltar semaforo ambar']
  },
  {
    nombre: 'Saltarse un semáforo en rojo',
    ejeId: 1,
    alias: ['saltarse un semaforo en rojo', 'semaforo en rojo', 'pasar semaforo rojo']
  },

  // ==========================================
  // EJE 2: Control de la Dinámica y Seguridad Vial
  // ==========================================
  {
    nombre: 'Atropello de un peatón',
    ejeId: 2,
    alias: ['atropello de un peaton', 'atropello peaton']
  },
  {
    nombre: 'Atropello de un perro',
    ejeId: 2,
    alias: ['atropello de un perro', 'atropello perro', 'atropello animal']
  },
  {
    nombre: 'Colisión con un objeto',
    ejeId: 2,
    alias: ['colision con un objeto', 'colision objeto']
  },
  {
    nombre: 'Colisión con un vehículo de incidencia',
    ejeId: 2,
    alias: ['colision con un vehiculo de incidencia', 'colision vehiculo de incidencia']
  },
  {
    nombre: 'Colisión con un vehículo del tráfico',
    ejeId: 2,
    alias: ['colision con un vehiculo del trafico', 'colision vehiculo trafico']
  },
  {
    nombre: 'Colisión con unas piedras',
    ejeId: 2,
    alias: ['colision con unas piedras', 'colision piedras', 'choque con piedras']
  },
  {
    nombre: 'Derrape del remolque',
    ejeId: 2,
    alias: ['derrape del remolque', 'derrape remolque']
  },
  {
    nombre: 'Derrape delantero',
    ejeId: 2,
    alias: ['derrape delantero']
  },
  {
    nombre: 'Derrape trasero',
    ejeId: 2,
    alias: ['derrape trasero']
  },
  {
    nombre: 'Efectuar un frenado brusco',
    ejeId: 2,
    alias: ['efectuar un frenado brusco', 'frenado brusco']
  },
  {
    nombre: 'Exceso de velocidad',
    ejeId: 2,
    alias: ['exceso de velocidad', 'superar limite de velocidad']
  },
  {
    nombre: 'Salirse de la vía',
    ejeId: 2,
    alias: ['salirse de la via', 'salida de la via', 'salida de via', 'vehiculo fuera de la via']
  },
  {
    nombre: 'Vuelco',
    ejeId: 2,
    alias: ['vuelco', 'volcadura']
  },
  {
    nombre: 'Vuelco del remolque',
    ejeId: 2,
    alias: ['vuelco del remolque', 'volcadura de remolque', 'volcadura remolque']
  },

  // ==========================================
  // EJE 3: Eficiencia y Gestión del Motor (RPM y Térmica)
  // ==========================================
  {
    nombre: 'Abusar del acelerador en la aproximación a un cruce',
    ejeId: 3,
    alias: ['abusar del acelerador en la aproximacion a un cruce', 'acelerador aproximacion cruce']
  },
  {
    nombre: 'Abusar del acelerador en la aproximación a un vehículo parado',
    ejeId: 3,
    alias: ['abusar del acelerador en la aproximacion a un vehiculo parado', 'acelerador aproximacion vehiculo parado']
  },
  {
    nombre: 'Acelerar a fondo por encima de la zona verde',
    ejeId: 3,
    alias: ['acelerar a fondo por encima de la zona verde']
  },
  {
    nombre: 'Acelerar al 75% del recorrido del pedal por debajo de la zona verde',
    ejeId: 3,
    alias: [
      'acelerar al 75% del recorrido del pedal por debajo de la zona verde',
      'acelerar al 75% por debajo de zona verde'
    ]
  },
  {
    nombre: 'Acelerar con el retarder o freno motor activo',
    ejeId: 3,
    alias: [
      'acelerar con el retarder o freno motor activo',
      'acelerar con retarder',
      'acelerar con freno de motor'
    ]
  },
  {
    nombre: 'Acelerar en vacío con el motor arrancado',
    ejeId: 3,
    alias: ['acelerar en vacio con el motor arrancado', 'acelerar en vacio']
  },
  {
    nombre: 'Acelerar por encima de la zona verde',
    ejeId: 3,
    alias: ['acelerar por encima de la zona verde', 'sobrepasar zona verde']
  },
  {
    nombre: 'Acelerar tras un cambio de marcha que nos haya dejado por debajo de la zona verde',
    ejeId: 3,
    alias: [
      'acelerar tras un cambio de marcha que nos haya dejado por debajo de la zona verde',
      'acelerar despues de cambio de marcha con revoluciones bajas',
      'acelerar despues de cambio de marcha',
      'acelerar tras cambio de marcha con revoluciones bajas'
    ]
  },
  {
    nombre: 'Bajar más de una marcha con el motor frío',
    ejeId: 3,
    alias: ['bajar mas de una marcha con el motor frio', 'bajar marchas motor frio']
  },
  {
    nombre: 'Subir más de una marcha con el motor frío',
    ejeId: 3,
    alias: ['subir mas de una marcha con el motor frio', 'subir marchas motor frio']
  },
  {
    nombre: 'Superar la zona roja de las rpm',
    ejeId: 3,
    alias: ['superar la zona roja de las rpm', 'zona roja de rpm', 'sobrepasar zona roja']
  },
  {
    nombre: 'Utilizar el freno de servicio antes que los ralentizadores',
    ejeId: 3,
    alias: [
      'utilizar el freno de servicio antes que los ralentizadores',
      'freno de servicio antes que ralentizadores',
      'freno servicio antes de retarder'
    ]
  },

  // ==========================================
  // EJE 4: Técnica de Transmisión y Uso del Embrague
  // ==========================================
  {
    nombre: 'Circular en punto muerto o con embrague presionado',
    ejeId: 4,
    alias: [
      'circular en punto muerto o con embrague presionado',
      'circular en punto muerto',
      'circular con embrague presionado'
    ]
  },
  {
    nombre: 'No emplear el freno de embrague para engranar la marcha de arranque',
    ejeId: 4,
    alias: [
      'no emplear el freno de embrague para engranar la marcha de arranque',
      'freno de embrague para marcha de arranque'
    ]
  },
  {
    nombre: 'Cambiar de rango de marchas en neutra',
    ejeId: 4,
    alias: ['cambiar de rango de marchas en neutra', 'cambio de rango en neutra']
  },
  {
    nombre: 'Circular con el freno de mano puesto',
    ejeId: 4,
    alias: ['circular con el freno de mano puesto', 'freno de estacionamiento puesto', 'freno de mano puesto']
  },
  {
    nombre: 'En movimiento de avance no parar el vehículo para meter marcha atrás',
    ejeId: 4,
    alias: [
      'en movimiento de avance no parar el vehiculo para meter marcha atras',
      'meter marcha de reversa en movimiento',
      'reversa en movimiento'
    ]
  },
  {
    nombre: 'En movimiento de retroceso no parar el vehículo para meter marcha adelante',
    ejeId: 4,
    alias: [
      'en movimiento de retroceso no parar el vehiculo para meter marcha adelante',
      'marcha adelante en movimiento de retroceso'
    ]
  },
  {
    nombre: 'Estar parado con una marcha metida y el embrague presionado',
    ejeId: 4,
    alias: [
      'estar parado con una marcha metida y el embrague presionado',
      'parado con marcha metida y embrague presionado'
    ]
  },
  {
    nombre: 'Parar el vehículo con una marcha demasiado alta engranada',
    ejeId: 4,
    alias: [
      'parar el vehiculo con una marcha demasiado alta engranada',
      'parar con marcha alta engranada'
    ]
  },
  {
    nombre: 'Presionar el embrague antes que el freno de servicio en una frenada',
    ejeId: 4,
    alias: [
      'presionar el embrague antes que el freno de servicio en una frenada',
      'embrague antes que freno de servicio'
    ]
  },

  // ==========================================
  // EJE 5: Procedimientos de Arranque y Preparación
  // ==========================================
  {
    nombre: 'Iniciar el movimiento sin suficiente presión en los depósitos de freno',
    ejeId: 5,
    alias: [
      'iniciar el movimiento sin suficiente presion en los depositos de freno',
      'sin suficiente presion de aire',
      'presion en los depositos de freno'
    ]
  },
  {
    nombre: 'No comprobar que la transmisión está en neutro antes de arrancar el motor',
    ejeId: 5,
    alias: [
      'no comprobar que la transmision esta en neutro antes de arrancar el motor',
      'no comprobar transmision en neutro antes de arrancar'
    ]
  },
  {
    nombre: 'No iniciar la marcha en primera en llano',
    ejeId: 5,
    alias: ['no iniciar la marcha en primera en llano', 'no iniciar en primera en llano']
  },
  {
    nombre: 'Encender el motor usando el acelerador',
    ejeId: 5,
    alias: ['encender el motor usando el acelerador', 'arrancar motor con acelerador']
  },
  {
    nombre: 'No iniciar la marcha en primera en pendiente ascendente',
    ejeId: 5,
    alias: [
      'no iniciar la marcha en primera en pendiente ascendente',
      'no iniciar en primera en pendiente'
    ]
  }
];

/**
 * Normaliza un texto removiendo acentos, puntuación redundante y dobles espacios.
 */
export function normalizeMistakeName(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.:;,\-_]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Busca un error en el catálogo y devuelve su entrada con el eje correspondiente.
 * Utiliza coincidencia exacta y búsqueda de subcadenas o alias.
 */
export function findCatalogMistake(rawName) {
  const norm = normalizeMistakeName(rawName);
  if (!norm) return null;

  // 1. Coincidencia exacta por nombre normalizado
  let found = MISTAKE_CATALOG.find(m => normalizeMistakeName(m.nombre) === norm);
  if (found) return found;

  // 2. Coincidencia exacta en lista de alias
  found = MISTAKE_CATALOG.find(m =>
    m.alias && m.alias.some(al => normalizeMistakeName(al) === norm)
  );
  if (found) return found;

  // 3. Coincidencia por contención (si la cadena del reporte contiene o está contenida en el alias)
  found = MISTAKE_CATALOG.find(m => {
    const mainNorm = normalizeMistakeName(m.nombre);
    if (mainNorm.includes(norm) || norm.includes(mainNorm)) return true;
    return m.alias && m.alias.some(al => {
      const aNorm = normalizeMistakeName(al);
      return aNorm.includes(norm) || norm.includes(aNorm);
    });
  });

  return found || null;
}

/**
 * Retorna los detalles de la dimensión / eje por su ID (1 al 5).
 */
export function getDimensionById(ejeId) {
  return Object.values(MISTAKE_DIMENSIONS).find(dim => dim.id === ejeId) || null;
}
