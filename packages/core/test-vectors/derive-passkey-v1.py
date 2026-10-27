"""Independent Python KDF/BIP39 oracle; Bun only reads the English word list.
Run from the repository root with Python cryptography >= 46 and installed deps.
The input is a PUBLIC test PRF result, not a credential or production secret.
"""
import hashlib
import hmac
import json
import subprocess
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization


def hkdf(ikm, salt, info, length):
    extracted = hmac.digest(salt, ikm, 'sha256')
    return hmac.digest(extracted, info + b'\x01', 'sha256')[:length]


words = json.loads(subprocess.check_output([
    'bun', '-e', 'import {wordlist} from "@scure/bip39/wordlists/english.js"; console.log(JSON.stringify(wordlist))'
], cwd='packages/core'))
prf = bytes(range(32))
entropy = hkdf(prf, b'stateless-reader/passkey-seed/v1', b'BIP39/english/128', 16)
bits = ''.join(f'{b:08b}' for b in entropy) + f'{hashlib.sha256(entropy).digest()[0]:08b}'[:4]
phrase = ' '.join(words[int(bits[i:i+11], 2)] for i in range(0, 132, 11))
seed = hashlib.pbkdf2_hmac('sha512', phrase.encode(), b'mnemonic', 2048, 64)
article = 'the-quiet-web'
private = hkdf(seed, b'stateless-reader/article-key/v1', b'["Ed25519","the-quiet-web"]', 32)
public = Ed25519PrivateKey.from_private_bytes(private).public_key().public_bytes(
    serialization.Encoding.Raw, serialization.PublicFormat.Raw)
print(json.dumps(dict(prf=prf.hex(), entropy=entropy.hex(), phrase=phrase, seed=seed.hex(),
                     articleId=article, publicKey=public.hex()), indent=2))
