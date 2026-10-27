"""Independent public passkey v2 vector. Python 3 + cryptography >= 46."""
import json
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

prf = bytes(range(32))
seed = HKDF(algorithm=hashes.SHA256(), length=64,
            salt=b'stateless-reader/passkey-seed/v2', info=b'reader-seed').derive(prf)
public = Ed25519PrivateKey.from_private_bytes(HKDF(
    algorithm=hashes.SHA256(), length=32, salt=b'stateless-reader/article-key/v1',
    info=b'["Ed25519","the-quiet-web"]').derive(seed)).public_key().public_bytes(
    serialization.Encoding.Raw, serialization.PublicFormat.Raw)
print(json.dumps(dict(prf=prf.hex(), seed=seed.hex(), articleId='the-quiet-web', publicKey=public.hex()), indent=2))
