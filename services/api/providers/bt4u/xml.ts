/**
 * Minimal XML DataSet parser for the official BT4U ASMX web service.
 *
 * Every operation returns the same ADO.NET DataSet document shape:
 *
 *   <DocumentElement>
 *     <RowElement><Field>value</Field><Field>value</Field>...</RowElement>
 *     <RowElement>...</RowElement>
 *   </DocumentElement>
 *
 * The row element name varies per operation (ScheduledStops, ScheduledRoutes,
 * CurrentBusInfo, NextDepartures, PatternNames, StopDistances, and even the
 * route short code itself for GetScheduledPatternPoints), so we parse
 * structurally by depth rather than by tag name. React Native has no DOMParser,
 * and the app ships no XML dependency, so this is intentionally dependency-free
 * and scoped to this simple, well-controlled shape.
 */

export type XmlRow = Record<string, string>;

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

const decodeEntities = (text: string): string =>
  text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, code: string) => {
    if (code[0] === '#') {
      const isHex = code[1] === 'x' || code[1] === 'X';
      const value = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isNaN(value) ? whole : String.fromCodePoint(value);
    }
    return XML_ENTITIES[code] ?? whole;
  });

const TAG_RE = /<(\/?)([A-Za-z_][\w.\-:]*)\b[^>]*?(\/?)>/g;

/**
 * Parses a DataSet document into an array of flat records (one per row element).
 * Field values are decoded and trimmed. Nested/self-closing empty fields are
 * omitted. Returns `[]` for an empty document (`<DocumentElement />`).
 */
export const parseDataSetRows = (xml: string): XmlRow[] => {
  if (!xml) return [];

  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, '') // XML declaration / processing instructions
    .replace(/<!--[\s\S]*?-->/g, '') // comments
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, inner: string) => inner); // inline CDATA text

  const rows: XmlRow[] = [];

  // depth: number of currently-open elements.
  //   1 = inside <DocumentElement>, 2 = inside a row, 3 = inside a field.
  let depth = 0;
  let row: XmlRow | null = null;
  let fieldName: string | null = null;
  let fieldBuffer = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(cleaned)) !== null) {
    const [full, closing, name, selfClosing] = match;
    const textBefore = cleaned.slice(cursor, match.index);
    cursor = match.index + full.length;

    // Accumulate text belonging to the active field (depth >= 3 covers any
    // accidental nesting inside a field; scalar fields are the common case).
    if (depth >= 3 && fieldName !== null) {
      fieldBuffer += textBefore;
    }

    if (selfClosing) {
      // Self-closing tag: no depth change. An empty field (e.g. <StopNotes />)
      // is simply left absent from the record.
      continue;
    }

    if (!closing) {
      depth += 1;
      if (depth === 2) {
        row = {};
      } else if (depth === 3) {
        fieldName = name;
        fieldBuffer = '';
      }
      continue;
    }

    // Closing tag.
    if (depth === 3 && fieldName !== null && row !== null) {
      row[fieldName] = decodeEntities(fieldBuffer).trim();
      fieldName = null;
      fieldBuffer = '';
    } else if (depth === 2 && row !== null) {
      rows.push(row);
      row = null;
    }
    depth -= 1;
  }

  return rows;
};

/** Returns the first present, non-empty value among the given field names. */
export const pickField = (row: XmlRow, ...names: string[]): string | undefined => {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== '') return value;
  }
  return undefined;
};
