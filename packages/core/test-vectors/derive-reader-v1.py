"""Independent vector oracle. Run with Python 3 and cryptography >= 46."""
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

# Public raw-seed fixture: article/request protocol is independent of seed source.
seed = bytes(range(64))
vectors = []
for article in ['the-quiet-web', 'a-library-in-your-pocket']:
    private = HKDF(algorithm=hashes.SHA256(), length=32,
                   salt=b'stateless-reader/article-key/v1',
                   info=json.dumps(['Ed25519', article], separators=(',', ':')).encode()).derive(seed)
    key = Ed25519PrivateKey.from_private_bytes(private)
    public = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    timestamp = '1793102400'
    message = json.dumps(['stateless-reader/request/v1', article, public, 'GET', '/article/' + article, timestamp], separators=(',', ':'))
    signature = key.sign(message.encode()).hex()
    vectors.append(dict(articleId=article, privateKey=private.hex(), publicKey=public,
                        timestamp=int(timestamp), message=message, signature=signature,
                        authorization=f'Reader-v1 {public}.{timestamp}.{signature}'))
print(json.dumps(dict(seed=seed.hex(), vectors=vectors), indent=2))
