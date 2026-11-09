"""Import the pinned Nuxeo SVG and scalar theme sources without a Polymer runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument('--elements', type=Path, required=True)
parser.add_argument('--webui', type=Path, required=True)
parser.add_argument('--messages-only', action='store_true', help='Refresh catalogs without rewriting icons or themes.')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
pins = {'elements': 'a2e7ff950bec19dbf04d14369db9e46fdabb0dd3', 'webui': 'e0ccb86615c692a3a60c557d363d4ce32f91c686'}
for name in pins:
    actual = subprocess.check_output(['git', '-C', str(getattr(args, name)), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != pins[name]:
        raise SystemExit(f'{name} must be at the qualified source revision {pins[name]}')

source = (args.elements / 'ui/nuxeo-icons.js').read_text()
license_notice = source[:source.index('*/') + 2]
normalized, repairs = re.subn(r'(<g id="unretain">\s*<path\s+d="[^"]+")\s*</g>', r'\1></path></g>', source, count=1, flags=re.S)
if repairs != 1:
    raise SystemExit('Expected the pinned unretain path closing-tag defect exactly once.')
svg = ET.fromstring(normalized[normalized.index('<svg>'):normalized.index('</svg>') + 6])

def node(element):
    attributes = {key.replace('{http://www.w3.org/XML/1998/namespace}', 'xml:'): value for key, value in element.attrib.items() if key != 'id'}
    result = {'tag': element.tag, 'attributes': attributes}
    if element.text and element.text.strip():
        result['text'] = element.text
    if len(element):
        result['children'] = [node(child) for child in element]
    return result

icons = {f'nuxeo:{element.attrib["id"]}': {'viewBox': '0 0 24 24', 'nodes': [node(element)]} for element in svg.find('defs')}
if len(icons) != 76:
    raise SystemExit('The qualified baseline contains exactly 76 Nuxeo icons.')
if not args.messages_only:
    (root / 'app/extensions/nuxeo-icons.generated.ts').write_text(license_notice + '\nimport { WebUiIcon } from "./webui-icons";\n\nexport const NUXEO_ICONS: Readonly<Record<string, WebUiIcon>> = ' + json.dumps(icons, ensure_ascii=False, indent=2) + ';\n')

(root / 'assets/themes').mkdir(parents=True, exist_ok=True)
if not args.messages_only:
    (root / 'assets/themes/kawaii-background.png').write_bytes((args.webui / 'themes/kawaii/background.png').read_bytes())

themes = {}
for name in ('default', 'light', 'dark', 'kawaii'):
    content = (args.webui / f'themes/{name}/theme.html').read_text()
    themes[name] = {key: value.strip() for key, value in re.findall(r'(--[\w-]+)\s*:\s*([^;{}]+);', content)}
if not args.messages_only:
    (root / 'app/extensions/polymer-theme-tokens.generated.ts').write_text(license_notice + '\nexport const POLYMER_THEME_TOKENS: Readonly<Record<string, Readonly<Record<string, string>>>> = ' + json.dumps(themes, indent=2) + ';\n')

messages = {}
message_sources = {}
message_normalizations = {}
locales = {'en-US': 'messages.json', 'es': 'messages-es-ES.json', 'fr': 'messages-fr.json', 'ar': 'messages-ar.json', 'ro': None, 'pt-PT': 'messages-pt-PT.json', 'it': 'messages-it.json'}
overrides_path = root / 'scripts/i18n/polymer-overrides.json'
overrides = json.loads(overrides_path.read_text()) if overrides_path.exists() else {}
for locale, filename in locales.items():
    if filename is None:
        messages[locale] = dict(overrides.get(locale, {}))
        message_sources[locale] = []
        continue
    sources = [args.elements / 'ui/i18n' / filename, args.webui / 'i18n' / filename]
    catalog = {}
    message_sources[locale] = []
    for path in sources:
        content = path.read_bytes()
        values = json.loads(content)
        catalog.update(values)
        message_sources[locale].append({'repository': 'elements' if path.is_relative_to(args.elements) else 'webui', 'path': str(path.relative_to(args.elements if path.is_relative_to(args.elements) else args.webui)), 'sha256': hashlib.sha256(content).hexdigest(), 'count': len(values)})
    # Polymer interpolates these quoted positional parameters; ICU treats ASCII
    # apostrophes as quoting syntax. Keep visible quotes while retaining substitution.
    normalized_count = 0
    for key, value in catalog.items():
        catalog[key], count = re.subn(r"(?<!')'(\{\d+\})'(?!')", r'‘\1’', value)
        normalized_count += count
    message_normalizations[locale] = normalized_count
    catalog.update(overrides.get(locale, {}))
    messages[locale] = catalog
english_keys = set(messages['en-US'])
for locale, catalog in messages.items():
    if set(catalog) != english_keys:
        missing = sorted(english_keys - set(catalog))
        extra = sorted(set(catalog) - english_keys)
        raise SystemExit(f'{locale} catalog keys do not match English: missing={missing}, extra={extra}')
    for key, value in catalog.items():
        if not isinstance(value, str) or not value.strip():
            raise SystemExit(f'{locale}:{key} must contain a non-empty translated message')
(root / 'app/extensions/polymer-messages.generated.ts').write_text(license_notice + '\nexport const POLYMER_MESSAGES: Readonly<Record<string, Readonly<Record<string, string>>>> = ' + json.dumps(messages, ensure_ascii=False, indent=2) + ';\n')

provenance = {'revisions': pins, 'iconCount': len(icons), 'iconSourceSha256': hashlib.sha256(source.encode()).hexdigest(), 'scalarThemeTokenCounts': {name: len(values) for name, values in themes.items()}, 'normalizations': ['Closed the malformed unretain path element; all path data and transforms retained.'], 'messages': list(messages), 'messageCounts': {locale: len(catalog) for locale, catalog in messages.items()}, 'kawaiiBackgroundSha256': hashlib.sha256((root / 'assets/themes/kawaii-background.png').read_bytes()).hexdigest(), 'missingSourceLocales': ['ro']}
provenance['messageSources'] = message_sources
provenance['localeAliases'] = {'es': 'es-ES'}
provenance['messageNormalizations'] = {'rule': "ASCII quotes around positional parameters become typographic quotes, preserving interpolation when moving from Polymer to ICU.", 'counts': message_normalizations}
provenance['supplementalMessages'] = {'path': 'scripts/i18n/polymer-overrides.json', 'sha256': hashlib.sha256(overrides_path.read_bytes()).hexdigest() if overrides_path.exists() else None, 'counts': {locale: len(values) for locale, values in overrides.items()}, 'reviewStatus': 'Agent-authored translations; independent native-speaker review is pending.'}
(root / 'app/extensions/polymer-assets.provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
print(json.dumps(provenance, indent=2))
