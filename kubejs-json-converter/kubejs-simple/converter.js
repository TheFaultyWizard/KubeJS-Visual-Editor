// converter.js — Simple <-> KubeJS recipe conversion.

//   simpleTextToKubeText(text)  Simple JSON text  -> KubeJS script text
//   kubeTextToSimpleText(code)  KubeJS script     -> { text, warnings }
//   exampleSimpleText()         simple example with all recipe types




// constants

// Simple recipe type -> the KubeJS method that creates it.
const COOKING_METHODS = {
  smelting: 'smelting',
  blasting: 'blasting',
  smoking: 'smoking',
  campfire_cooking: 'campfireCooking'
};

const RECIPE_TYPES = [
  'shaped', 'shapeless', 'smithing',
  'smelting', 'blasting', 'smoking', 'campfire_cooking',
  'stonecutting', 'custom'
];

const MAX_STACK = 64;
const MAX_SHAPELESS_INGREDIENTS = 9;


// small helpers

function fail(where, message) {
  throw new Error(where + ': ' + message);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isPrimitive(v) {
  return v === null || typeof v !== 'object';
}



// Validation / normalization (Simple format)

// Reads an item stack written in any supported style and returns { id, count }.
// Accepted: "id", "3x id", "#tag", Item.of() stacks, and { item | tag, count } objects.
function parseStack(v, where) {
  if (v && typeof v === 'object' && v.__stack) {
    return { id: v.id, count: v.count };
  }

  if (typeof v === 'string') {
    const match = v.trim().match(/^(\d+)\s*x\s+(\S.*)$/);
    return match
      ? { id: match[2].trim(), count: parseInt(match[1], 10) }
      : { id: v.trim(), count: 1 };
  }

  if (isPlainObject(v)) {
    const id = v.item ? v.item : (v.tag ? '#' + v.tag : null);
    if (id) return { id: id, count: v.count === undefined ? 1 : v.count };
  }

  fail(where, 'could not understand ' + JSON.stringify(v));
}

function checkStack(stack, where, maxCount) {
  if (typeof stack.id !== 'string' || !stack.id || stack.id === '#') {
    fail(where, 'missing item id');
  }
  const countOk = Number.isInteger(stack.count) && stack.count >= 1 && stack.count <= maxCount;
  if (!countOk) {
    fail(where, 'count must be a whole number from 1 to ' + maxCount);
  }
}

// inputs are { item } or { tag }, with count only when it is more than 1.
function normalizeIngredient(v, where) {
  const stack = parseStack(v, where);
  checkStack(stack, where, MAX_STACK);

  const isTag = stack.id.charAt(0) === '#';
  const result = isTag ? { tag: stack.id.slice(1) } : { item: stack.id };
  if (stack.count > 1) result.count = stack.count;
  return result;
}

// outputs always { item, count }
function normalizeOutput(v, where) {
  const stack = parseStack(v, where);
  checkStack(stack, where, MAX_STACK);

  if (stack.id.charAt(0) === '#') fail(where, 'an output cannot be a tag');
  return { item: stack.id, count: stack.count };
}

// Optional numeric field: returns undefined when absent, throws when invalid.
function readOptionalNumber(recipe, field, where, mustBeInteger) {
  const value = recipe[field];
  if (value === undefined || value === null) return undefined;

  const valid = typeof value === 'number' && value >= 0 && (!mustBeInteger || Number.isInteger(value));
  if (!valid) {
    fail(where, '"' + field + '" must be a ' + (mustBeInteger ? 'whole ' : '') + 'number >= 0');
  }
  return value;
}

// validate recipe types
function normalizeShaped(r, w) {
  const rows = r.pattern;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 3) {
    fail(w, '"pattern" must be an array of 1-3 rows');
  }
  rows.forEach(function (row) {
    if (typeof row !== 'string' || row.length < 1 || row.length > 3) {
      fail(w, 'each pattern row must be a string of 1-3 characters');
    }
  });

  if (!r.key || typeof r.key !== 'object') fail(w, '"key" must map letters to items');

  const key = {};
  Object.keys(r.key).forEach(function (letter) {
    if (letter.length !== 1) fail(w, 'key "' + letter + '" must be a single character');
    const ingredient = normalizeIngredient(r.key[letter], w + ' key "' + letter + '"');
    if (ingredient.count) fail(w, 'key "' + letter + '" must have a count of 1');
    key[letter] = ingredient;
  });

  // Every non-blank cell in the grid needs a matching key entry.
  for (const cell of rows.join('').replace(/ /g, '')) {
    if (!(cell in key)) fail(w, 'pattern uses "' + cell + '" but "key" has no entry for it');
  }

  return { output: normalizeOutput(r.output, w + ' "output"'), pattern: rows.slice(), key: key };
}

function normalizeShapeless(r, w) {
  if (!Array.isArray(r.ingredients) || r.ingredients.length < 1) {
    fail(w, '"ingredients" must be a non-empty array');
  }

  const ingredients = r.ingredients.map(function (item, i) {
    return normalizeIngredient(item, w + ' ingredient ' + (i + 1));
  });

  const total = ingredients.reduce(function (sum, item) { return sum + (item.count || 1); }, 0);
  if (total > MAX_SHAPELESS_INGREDIENTS) {
    fail(w, 'total ingredient count is ' + total + ' (max ' + MAX_SHAPELESS_INGREDIENTS + ')');
  }

  return { output: normalizeOutput(r.output, w + ' "output"'), ingredients: ingredients };
}

function normalizeSmithing(r, w) {
  const fields = { output: normalizeOutput(r.output, w + ' "output"') };
  // The template slot only exists in newer Minecraft versions, so it is optional.
  if (r.template !== undefined && r.template !== null) {
    fields.template = normalizeIngredient(r.template, w + ' "template"');
  }
  fields.base = normalizeIngredient(r.base, w + ' "base"');
  fields.addition = normalizeIngredient(r.addition, w + ' "addition"');
  return fields;
}

function normalizeCooking(r, w) {
  const fields = {
    input: normalizeIngredient(r.input, w + ' "input"'),
    output: normalizeOutput(r.output, w + ' "output"')
  };
  if (fields.input.count) fail(w, '"input" must have a count of 1');

  const xp = readOptionalNumber(r, 'xp', w, false);
  const cookingTime = readOptionalNumber(r, 'cookingTime', w, true);
  if (xp !== undefined) fields.xp = xp;
  if (cookingTime !== undefined) fields.cookingTime = cookingTime;
  return fields;
}

function normalizeStonecutting(r, w) {
  const fields = {
    input: normalizeIngredient(r.input, w + ' "input"'),
    output: normalizeOutput(r.output, w + ' "output"')
  };
  if (fields.input.count) fail(w, '"input" must have a count of 1');
  return fields;
}

function normalizeCustom(r, w) {
  if (!isPlainObject(r.json) ) fail(w, '"json" must be the datapack recipe object');
  return { json: JSON.parse(JSON.stringify(r.json)) };   // deep copy
}

const NORMALIZERS = {
  shaped: normalizeShaped,
  shapeless: normalizeShapeless,
  smithing: normalizeSmithing,
  stonecutting: normalizeStonecutting,
  custom: normalizeCustom
};
Object.keys(COOKING_METHODS).forEach(function (type) { NORMALIZERS[type] = normalizeCooking; });

// Validates one recipe 
function normalizeRecipe(r, label) {
  if (!isPlainObject(r)) fail(label, 'must be an object');

  const type = r.type;
  if (RECIPE_TYPES.indexOf(type) < 0) {
    fail(label, 'unknown type "' + type + '" (expected one of: ' + RECIPE_TYPES.join(', ') + ')');
  }

  const where = label + ' (' + type + ')';
  const fields = NORMALIZERS[type](r, where);

  if (r.id === undefined || r.id === null) {
    return Object.assign({ type: type }, fields);
  }
  if (typeof r.id !== 'string' || !r.id) fail(where, '"id" must be a non-empty string');
  return Object.assign({ type: type, id: r.id }, fields);
}


// make it pretty

// Quotes a string as a single-quoted JS literal.
function jsStr(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
}

// Object keys only get quotes when they are not valid identifiers.
function jsKey(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) ? k : jsStr(k);
}

const JS_STYLE = {
  prim: function (v) { return typeof v === 'string' ? jsStr(v) : String(v); },
  key: jsKey
};
const JSON_STYLE = {
  prim: function (v) { return JSON.stringify(v); },
  key: function (k) { return JSON.stringify(k); }
};

// Formats a value with 2-space indentation. Objects/arrays containing only
// primitives stay on one line; anything with nesting is expanded.
function fmt(value, level, style, forceMulti) {
  if (isPrimitive(value)) return style.prim(value);

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map(function (v) { return [null, v]; })
    : Object.entries(value);

  if (!entries.length) return isArray ? '[]' : '{}';

  const formatEntry = function (entry) {
    const prefix = isArray ? '' : style.key(entry[0]) + ': ';
    return prefix + fmt(entry[1], level + 1, style);
  };

  const open = isArray ? '[' : '{';
  const close = isArray ? ']' : '}';

  const onlyPrimitives = entries.every(function (entry) { return isPrimitive(entry[1]); });
  if (onlyPrimitives && !forceMulti) {
    const inner = entries.map(formatEntry).join(', ');
    return isArray ? open + inner + close : open + ' ' + inner + ' ' + close;
  }

  const indent = '  '.repeat(level + 1);
  const body = entries.map(function (entry) { return indent + formatEntry(entry); }).join(',\n');
  return open + '\n' + body + '\n' + '  '.repeat(level) + close;
}

function formatSimple(obj) {
  return fmt(obj, 0, JSON_STYLE, true) + '\n';
}


// Simple -> KubeJS

function kubeId(stack) {
  return stack.tag ? '#' + stack.tag : stack.item;
}

// "3x minecraft:stone" style string literal.
function kubeStack(stack) {
  const count = stack.count || 1;
  return jsStr(count > 1 ? count + 'x ' + kubeId(stack) : kubeId(stack));
}

// Item.of('id', n) when n > 1, otherwise just the plain id string.
function kubeItemOf(stack) {
  const count = stack.count || 1;
  return count > 1 ? 'Item.of(' + jsStr(stack.item) + ', ' + count + ')' : jsStr(stack.item);
}

function indentLines(lines, spaces) {
  const pad = ' '.repeat(spaces);
  return lines.map(function (line) { return pad + line; }).join(',\n');
}

// Each generator returns the lines for one recipe call. `idCall` is either ''
// or ".id('...')", to be tacked onto the end of the call.

function genShaped(r, idCall) {
  const keyLines = Object.keys(r.key).map(function (k) { return jsKey(k) + ': ' + kubeStack(r.key[k]); });
  return [
    '  event.shaped(',
    '    ' + kubeItemOf(r.output) + ',',
    '    [',
    indentLines(r.pattern.map(jsStr), 6),
    '    ],',
    '    {',
    indentLines(keyLines, 6),
    '    }',
    '  )' + idCall
  ];
}

function genShapeless(r, idCall) {
  return [
    '  event.shapeless(',
    '    ' + kubeItemOf(r.output) + ',',
    '    [',
    indentLines(r.ingredients.map(kubeStack), 6),
    '    ]',
    '  )' + idCall
  ];
}

function genSmithing(r, idCall) {
  const args = [kubeStack(r.output)];
  if (r.template) args.push(kubeStack(r.template));
  args.push(kubeStack(r.base), kubeStack(r.addition));
  return [
    '  event.smithing(',
    indentLines(args, 4),
    '  )' + idCall
  ];
}

function genCooking(r, idCall) {
  const lines = ['  event.' + COOKING_METHODS[r.type] + '(' + kubeStack(r.output) + ', ' + kubeStack(r.input) + ')'];
  if (r.xp !== undefined) lines.push('    .xp(' + r.xp + ')');
  if (r.cookingTime !== undefined) lines.push('    .cookingTime(' + r.cookingTime + ')');
  if (idCall) lines.push('    ' + idCall);
  return lines;
}

function genStonecutting(r, idCall) {
  return ['  event.stonecutting(' + kubeStack(r.output) + ', ' + kubeStack(r.input) + ')' + idCall];
}

function genCustom(r, idCall) {
  return ['  event.custom(' + fmt(r.json, 1, JS_STYLE, true) + ')' + idCall];
}

const GENERATORS = {
  shaped: genShaped,
  shapeless: genShapeless,
  smithing: genSmithing,
  stonecutting: genStonecutting,
  custom: genCustom
};
Object.keys(COOKING_METHODS).forEach(function (type) { GENERATORS[type] = genCooking; });

// One recipe as a numbered comment followed by its KubeJS call.
function genRecipe(r, number) {
  const label = r.type === 'custom' ? (r.json.type || '') : r.output.item;
  const header = '  // ' + number + '. ' + r.type + (label ? ': ' + label : '');
  const idCall = r.id ? '.id(' + jsStr(r.id) + ')' : '';

  return [header].concat(GENERATORS[r.type](r, idCall)).join('\n');
}

function simpleToKube(data) {
  const list = Array.isArray(data) ? data : (data && data.recipes);
  if (!Array.isArray(list)) {
    throw new Error('Expected {"recipes": [ ... ]} (or a bare array of recipes).');
  }

  const recipes = list.map(function (r, i) { return normalizeRecipe(r, 'Recipe #' + (i + 1)); });

  return [
    '// kubejs/server_scripts/kubejs-scripts.js',
    '// Generated from the Simple format. Reload in-game with /reload.',
    '',
    'ServerEvents.recipes(event => {',
    '',
    recipes.map(function (r, i) { return genRecipe(r, i + 1); }).join('\n\n'),
    '',
    '})',
    ''
  ].join('\n');
}

function simpleTextToKubeText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('The Simple box is not valid JSON: ' + e.message);
  }
  return simpleToKube(data);
}


// KubeJS -> Simple
function runKubeScript(code) {
  const rawRecipes = [];
  const warnings = [];

  function warn(message) {
    if (warnings.indexOf(message) < 0) warnings.push(message);
  }

  // A stand-in that accepts any property access or call and just records a warning.
  function deepStub(label) {
    return new Proxy(function () {}, {
      get: function (target, prop) {
        return typeof prop === 'string' ? deepStub(label + '.' + prop) : undefined;
      },
      apply: function () {
        warn('Unsupported call ' + label + '() was ignored');
        return deepStub(label + '()');
      }
    });
  }

  // real properties work normally; unknown ones become stubs.
  function lenient(target, label) {
    return new Proxy(target, {
      get: function (t, prop, receiver) {
        if (typeof prop !== 'string' || prop in t) return Reflect.get(t, prop, receiver);
        return deepStub(label + '.' + prop);
      }
    });
  }

  // returned by every recipe call so scripts can chain .xp() / .cookingTime() / .id().
  function makeChain(recipe) {
    const methods = {
      xp: function (v) { recipe.xp = v; return chained; },
      cookingTime: function (v) { recipe.cookingTime = v; return chained; },
      id: function (v) { recipe.id = v; return chained; }
    };
    const chained = lenient(methods, 'recipe');
    return chained;
  }

  function record(recipe) {
    rawRecipes.push(recipe);
    return makeChain(recipe);
  }

  function cookingMethod(type) {
    return function (output, input, xp, cookingTime) {
      return record({ type: type, output: output, input: input, xp: xp, cookingTime: cookingTime });
    };
  }

  const event = lenient({
    shaped: function (output, pattern, key) {
      return record({ type: 'shaped', output: output, pattern: pattern, key: key });
    },
    shapeless: function (output, ingredients) {
      return record({ type: 'shapeless', output: output, ingredients: ingredients });
    },
    smithing: function () {
      const a = arguments;
      return record(a.length >= 4
        ? { type: 'smithing', output: a[0], template: a[1], base: a[2], addition: a[3] }
        : { type: 'smithing', output: a[0], base: a[1], addition: a[2] });
    },
    smelting: cookingMethod('smelting'),
    blasting: cookingMethod('blasting'),
    smoking: cookingMethod('smoking'),
    campfireCooking: cookingMethod('campfire_cooking'),
    stonecutting: function (output, input) {
      return record({ type: 'stonecutting', output: output, input: input });
    },
    custom: function (json) {
      return record({ type: 'custom', json: json });
    }
  }, 'event');

  // events
  const ServerEvents = new Proxy({}, {
    get: function (target, name) {
      if (typeof name !== 'string') return undefined;
      return function (callback) {
        if (name === 'recipes' && typeof callback === 'function') callback(event);
        else warn('ServerEvents.' + name + ' is not a recipe event and was ignored');
      };
    }
  });

  function onEvent(name, callback) {
    if (name === 'recipes' && typeof callback === 'function') callback(event);
    else warn('onEvent("' + name + '") is not a recipe event and was ignored');
  }


  // ignore things that aren't recipe events
  function otherEvents(label) {
    return new Proxy({}, {
      get: function (target, name) {
        if (typeof name !== 'string') return undefined;
        return function () { warn(label + '.' + name + ' is not a recipe event and was ignored'); };
      }
    });
  }

  const Item = {
    of: function (id, count) {
      if (count !== undefined && typeof count !== 'number') warn('Item.of() NBT/extra data was ignored');
      return { __stack: true, id: id, count: typeof count === 'number' ? count : 1 };
    }
  };
  const Ingredient = { of: function (x) { return x; } };

  const globals = {
    ServerEvents: ServerEvents,
    onEvent: onEvent,
    Item: Item,
    Ingredient: Ingredient,
    console: console,
    StartupEvents: otherEvents('StartupEvents'),
    ClientEvents: otherEvents('ClientEvents'),
    ItemEvents: otherEvents('ItemEvents'),
    BlockEvents: otherEvents('BlockEvents'),
    PlayerEvents: otherEvents('PlayerEvents'),
    EntityEvents: otherEvents('EntityEvents'),
    LevelEvents: otherEvents('LevelEvents'),
    window: undefined,
    document: undefined,
    fetch: undefined,
    XMLHttpRequest: undefined,
    localStorage: undefined,
    sessionStorage: undefined
  };
  const names = Object.keys(globals);
  const values = names.map(function (n) { return globals[n]; });

  let script;
  try {
    script = new Function(...names, code);
  } catch (e) {
    throw new Error('The KubeJS script has a syntax error: ' + e.message);
  }
  try {
    script.apply(null, values);
  } catch (e) {
    throw new Error('The KubeJS script failed while running: ' + e.message);
  }

  const recipes = rawRecipes.map(function (r, i) { return normalizeRecipe(r, 'Recipe #' + (i + 1)); });
  return { recipes: recipes, warnings: warnings };
}

function kubeTextToSimpleText(code) {
  const result = runKubeScript(code);
  return {
    text: formatSimple({ format: 'simple-recipes', version: 1, recipes: result.recipes }),
    warnings: result.warnings
  };
}


// example

function exampleSimpleText() {
  return formatSimple({
    format: 'simple-recipes',
    version: 1,
    recipes: [
      {
        type: 'shaped',
        output: { item: 'minecraft:stone', count: 3 },
        pattern: ['A B', ' C ', 'B A'],
        key: {
          A: { item: 'minecraft:andesite' },
          B: { item: 'minecraft:diorite' },
          C: { item: 'minecraft:granite' }
        }
      },
      {
        type: 'shapeless',
        output: { item: 'minecraft:dandelion', count: 3 },
        ingredients: [
          { item: 'minecraft:bone_meal' },
          { item: 'minecraft:yellow_dye' },
          { item: 'minecraft:ender_pearl', count: 3 }
        ]
      },
      {
        type: 'smithing',
        output: { item: 'minecraft:netherite_ingot', count: 1 },
        template: { item: 'minecraft:netherite_upgrade_smithing_template' },
        base: { item: 'minecraft:iron_ingot' },
        addition: { item: 'minecraft:black_dye' }
      },
      { type: 'smelting', input: { item: 'minecraft:stone' }, output: { item: 'minecraft:gravel', count: 3 } },
      { type: 'blasting', input: { item: 'minecraft:iron_ingot' }, output: { item: 'minecraft:iron_nugget', count: 10 } },
      { type: 'smoking', input: { item: 'minecraft:glass' }, output: { item: 'minecraft:tinted_glass', count: 1 }, xp: 0.35 },
      {
        type: 'campfire_cooking',
        input: { item: 'minecraft:stick' },
        output: { item: 'minecraft:torch', count: 1 },
        xp: 0.35,
        cookingTime: 600
      },
      { type: 'stonecutting', input: { tag: 'minecraft:planks' }, output: { item: 'minecraft:stick', count: 3 } },
      {
        type: 'custom',
        json: {
          type: 'farmersdelight:cutting',
          ingredients: [{ item: 'minecraft:cake' }],
          tool: { tag: 'forge:tools/knives' },
          result: [{ item: 'farmersdelight:cake_slice', count: 7 }]
        }
      },
      {
        type: 'custom',
        json: {
          type: 'tconstruct:alloy',
          inputs: [{ tag: 'forge:molten_gold', amount: 90 }, { tag: 'forge:molten_silver', amount: 90 }],
          result: { fluid: 'tconstruct:molten_electrum', amount: 180 },
          temperature: 760
        }
      }
    ]
  });
}


if (typeof module !== 'undefined') {
  module.exports = { simpleTextToKubeText, kubeTextToSimpleText, exampleSimpleText };
}