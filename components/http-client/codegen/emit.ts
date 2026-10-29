import { camelCase, pascalCase, snakeCase, type Field, type Model, type Schema, type Shape } from './schema';

export type TargetLanguage = 'typescript' | 'dart' | 'kotlin' | 'swift' | 'go' | 'python' | 'jsonschema';

export const TARGETS: Array<{ value: TargetLanguage; label: string; extension: string }> = [
  { value: 'typescript', label: 'TypeScript', extension: 'ts' },
  { value: 'dart', label: 'Dart / Flutter', extension: 'dart' },
  { value: 'kotlin', label: 'Kotlin', extension: 'kt' },
  { value: 'swift', label: 'Swift', extension: 'swift' },
  { value: 'go', label: 'Go', extension: 'go' },
  { value: 'python', label: 'Python (pydantic)', extension: 'py' },
  { value: 'jsonschema', label: 'JSON Schema', extension: 'json' },
];

export function emit(schema: Schema, target: TargetLanguage): string {
  switch (target) {
    case 'typescript':
      return emitTypeScript(schema);
    case 'dart':
      return emitDart(schema);
    case 'kotlin':
      return emitKotlin(schema);
    case 'swift':
      return emitSwift(schema);
    case 'go':
      return emitGo(schema);
    case 'python':
      return emitPython(schema);
    case 'jsonschema':
      return emitJsonSchema(schema);
  }
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function tsInline(shape: Shape, models: Model[], indent: string): string {
  if (shape.kind === 'ref') {
    const model = models.find((m) => m.name === shape.name);
    if (!model) return 'unknown';
    if (model.fields.length === 0) return 'Record<string, never>';
    const inner = indent + '  ';
    const lines = model.fields.map((field) => `${inner}${tsField(field, models, inner)}`);
    return `{\n${lines.join('\n')}\n${indent}}`;
  }
  if (shape.kind === 'array') {
    const item = tsInline(shape.item, models, indent);
    return /[\s|{]/.test(item) ? `Array<${item}>` : `${item}[]`;
  }
  return shape.type === 'integer' ? 'number' : shape.type === 'any' ? 'unknown' : shape.type;
}

function tsField(field: Field, models: Model[], indent: string): string {
  const key = IDENT.test(field.key) ? field.key : JSON.stringify(field.key);
  return `${key}${field.optional ? '?' : ''}: ${tsInline(field.shape, models, indent)}${
    field.nullable ? ' | null' : ''
  };`;
}

function emitTypeScript(schema: Schema): string {
  const root = schema.root;
  if (root.kind === 'ref') {
    const model = schema.models.find((m) => m.name === root.name)!;
    const lines = model.fields.map((field) => `  ${tsField(field, schema.models, '  ')}`);
    return `export interface ${model.name} {\n${lines.join('\n')}\n}`;
  }
  const inline = tsInline(root, schema.models, '');
  return `export type ${schema.rootName} = ${inline}${schema.rootNullable ? ' | null' : ''};`;
}

function dartType(shape: Shape): string {
  if (shape.kind === 'ref') return shape.name;
  if (shape.kind === 'array') return `List<${dartType(shape.item)}>`;
  switch (shape.type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    default:
      return 'dynamic';
  }
}

function dartFromJson(shape: Shape, expr: string, nullable: boolean): string {
  const bang = nullable ? '?' : '';
  if (shape.kind === 'ref') {
    return nullable
      ? `${expr} == null ? null : ${shape.name}.fromJson(${expr} as Map<String, dynamic>)`
      : `${shape.name}.fromJson(${expr} as Map<String, dynamic>)`;
  }
  if (shape.kind === 'array') {
    const inner = dartFromJson(shape.item, 'e', false);
    const mapped = inner === 'e' ? '' : `.map((e) => ${inner}).toList()`;
    const cast = mapped ? `(${expr} as List<dynamic>${bang})${bang}${mapped}` : `(${expr} as List<dynamic>${bang})${bang}.cast<${dartType(shape.item)}>()`;
    return cast;
  }
  if (shape.type === 'number') return `(${expr} as num${bang})${bang}.toDouble()`;
  if (shape.type === 'any') return expr;
  return `${expr} as ${dartType(shape)}${bang}`;
}

function dartToJson(shape: Shape, expr: string, nullable: boolean): string {
  const bang = nullable ? '?' : '';
  if (shape.kind === 'ref') return `${expr}${bang}.toJson()`;
  if (shape.kind === 'array') {
    const inner = dartToJson(shape.item, 'e', false);
    return inner === 'e' ? expr : `${expr}${bang}.map((e) => ${inner}).toList()`;
  }
  return expr;
}

function emitDart(schema: Schema): string {
  return schema.models
    .map((model) => {
      const fields = model.fields.map((field) => ({
        ...field,
        name: camelCase(field.key),
        opt: field.optional || field.nullable,
      }));
      const decl = fields.map((f) => `  final ${dartType(f.shape)}${f.opt ? '?' : ''} ${f.name};`);
      const ctor = fields.map((f) => `    ${f.opt ? '' : 'required '}this.${f.name},`);
      const from = fields.map((f) => `      ${f.name}: ${dartFromJson(f.shape, `json[${JSON.stringify(f.key)}]`, f.opt)},`);
      const to = fields.map((f) => `      ${JSON.stringify(f.key)}: ${dartToJson(f.shape, f.name, f.opt)},`);
      return [
        `class ${model.name} {`,
        ...decl,
        '',
        `  const ${model.name}({`,
        ...ctor,
        '  });',
        '',
        `  factory ${model.name}.fromJson(Map<String, dynamic> json) => ${model.name}(`,
        ...from,
        '  );',
        '',
        '  Map<String, dynamic> toJson() => {',
        ...to,
        '  };',
        '}',
      ].join('\n');
    })
    .join('\n\n');
}

function kotlinType(shape: Shape): string {
  if (shape.kind === 'ref') return shape.name;
  if (shape.kind === 'array') return `List<${kotlinType(shape.item)}>`;
  switch (shape.type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Long';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Boolean';
    default:
      return 'JsonElement';
  }
}

function emitKotlin(schema: Schema): string {
  const body = schema.models
    .map((model) => {
      const lines = model.fields.map((field) => {
        const name = camelCase(field.key);
        const opt = field.optional || field.nullable;
        const annotation = name === field.key ? '' : `@SerialName(${JSON.stringify(field.key)}) `;
        return `    ${annotation}val ${name}: ${kotlinType(field.shape)}${opt ? '? = null' : ''},`;
      });
      return `@Serializable\ndata class ${model.name}(\n${lines.join('\n')}\n)`;
    })
    .join('\n\n');
  return `import kotlinx.serialization.SerialName\nimport kotlinx.serialization.Serializable\nimport kotlinx.serialization.json.JsonElement\n\n${body}`;
}

function swiftType(shape: Shape): string {
  if (shape.kind === 'ref') return shape.name;
  if (shape.kind === 'array') return `[${swiftType(shape.item)}]`;
  switch (shape.type) {
    case 'string':
      return 'String';
    case 'integer':
      return 'Int';
    case 'number':
      return 'Double';
    case 'boolean':
      return 'Bool';
    default:
      return 'AnyCodable';
  }
}

function emitSwift(schema: Schema): string {
  const body = schema.models
    .map((model) => {
      const fields = model.fields.map((field) => ({ ...field, name: camelCase(field.key) }));
      const lines = fields.map(
        (f) => `    let ${f.name}: ${swiftType(f.shape)}${f.optional || f.nullable ? '?' : ''}`,
      );
      const needsKeys = fields.some((f) => f.name !== f.key);
      const keys = needsKeys
        ? [
            '',
            '    enum CodingKeys: String, CodingKey {',
            ...fields.map((f) =>
              f.name === f.key ? `        case ${f.name}` : `        case ${f.name} = ${JSON.stringify(f.key)}`,
            ),
            '    }',
          ]
        : [];
      return `struct ${model.name}: Codable {\n${[...lines, ...keys].join('\n')}\n}`;
    })
    .join('\n\n');
  const usesAny = schema.models.some((m) => m.fields.some((f) => swiftType(f.shape).includes('AnyCodable')));
  return `import Foundation\n${usesAny ? '// AnyCodable: gunakan package seperti Flight-School/AnyCodable untuk nilai bertipe campuran.\n' : ''}\n${body}`;
}

function goType(shape: Shape): string {
  if (shape.kind === 'ref') return shape.name;
  if (shape.kind === 'array') return `[]${goType(shape.item)}`;
  switch (shape.type) {
    case 'string':
      return 'string';
    case 'integer':
      return 'int64';
    case 'number':
      return 'float64';
    case 'boolean':
      return 'bool';
    default:
      return 'any';
  }
}

function emitGo(schema: Schema): string {
  return schema.models
    .map((model) => {
      const rows = model.fields.map((field) => {
        const opt = field.optional || field.nullable;
        const base = goType(field.shape);
        const type = opt && !base.startsWith('[]') && base !== 'any' ? `*${base}` : base;
        return [pascalCase(field.key), type, `\`json:"${field.key}${field.optional ? ',omitempty' : ''}"\``];
      });
      const w0 = Math.max(0, ...rows.map((r) => r[0]!.length));
      const w1 = Math.max(0, ...rows.map((r) => r[1]!.length));
      const lines = rows.map((r) => `\t${r[0]!.padEnd(w0)} ${r[1]!.padEnd(w1)} ${r[2]}`);
      return `type ${model.name} struct {\n${lines.join('\n')}\n}`;
    })
    .join('\n\n');
}

function pyType(shape: Shape): string {
  if (shape.kind === 'ref') return shape.name;
  if (shape.kind === 'array') return `list[${pyType(shape.item)}]`;
  switch (shape.type) {
    case 'string':
      return 'str';
    case 'integer':
      return 'int';
    case 'number':
      return 'float';
    case 'boolean':
      return 'bool';
    default:
      return 'Any';
  }
}

function emitPython(schema: Schema): string {
  const body = [...schema.models]
    .reverse()
    .map((model) => {
      const lines = model.fields.map((field) => {
        const name = snakeCase(field.key) || 'field';
        const opt = field.optional || field.nullable;
        const type = opt ? `${pyType(field.shape)} | None` : pyType(field.shape);
        const alias = name === field.key ? '' : `alias=${JSON.stringify(field.key)}`;
        const parts = [alias, opt ? 'default=None' : ''].filter(Boolean);
        return `    ${name}: ${type}${parts.length ? ` = Field(${parts.join(', ')})` : ''}`;
      });
      return `class ${model.name}(BaseModel):\n    model_config = ConfigDict(populate_by_name=True)\n\n${lines.join('\n') || '    pass'}`;
    })
    .join('\n\n\n');
  return `from typing import Any\n\nfrom pydantic import BaseModel, ConfigDict, Field\n\n\n${body}`;
}

function jsonSchemaOf(shape: Shape, nullable: boolean, models: Model[]): Record<string, unknown> {
  const node = ((): Record<string, unknown> => {
    if (shape.kind === 'ref') return { $ref: `#/$defs/${shape.name}` };
    if (shape.kind === 'array') return { type: 'array', items: jsonSchemaOf(shape.item, false, models) };
    return shape.type === 'any' ? {} : { type: shape.type };
  })();
  if (!nullable) return node;
  return 'type' in node && typeof node['type'] === 'string'
    ? { ...node, type: [node['type'], 'null'] }
    : { anyOf: [node, { type: 'null' }] };
}

function emitJsonSchema(schema: Schema): string {
  const defs: Record<string, unknown> = {};
  for (const model of schema.models) {
    const properties: Record<string, unknown> = {};
    for (const field of model.fields) {
      properties[field.key] = jsonSchemaOf(field.shape, field.nullable, schema.models);
    }
    defs[model.name] = {
      type: 'object',
      properties,
      required: model.fields.filter((f: Field) => !f.optional).map((f) => f.key),
      additionalProperties: false,
    };
  }
  return JSON.stringify(
    {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      ...jsonSchemaOf(schema.root, schema.rootNullable, schema.models),
      $defs: defs,
    },
    null,
    2,
  );
}
