"""Export generated PNG assets to WebP without altering their content or dimensions."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest_path = root / 'src/vocabulary-images.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for asset in manifest.values():
    source = root / 'public' / asset['image'].lstrip('/')
    if source.suffix == '.webp':
        continue
    target = source.with_suffix('.webp')
    if target.exists():
        raise FileExistsError(target)
    with Image.open(source) as im:
        im.save(target, 'WEBP', quality=85, method=6)
    archive = root / 'assets/imagegen-originals' / source.parent.name / source.name
    archive.parent.mkdir(parents=True, exist_ok=True)
    if archive.exists():
        raise FileExistsError(archive)
    assert source.resolve().is_relative_to(root)
    assert archive.resolve().is_relative_to(root)
    source.rename(archive)
    asset['image'] = asset['image'].removesuffix('.png') + '.webp'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Exported {len(manifest)} WebP assets; originals retained in assets/imagegen-originals.')
