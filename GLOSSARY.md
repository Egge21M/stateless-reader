# Stateless Reader

A proof of concept for purchasing access to individual premium web articles without a publisher account, using Cashu payments and reader-controlled cryptographic keys.

## Language

**Publisher**:
The party that offers premium articles for purchase and grants readers access after payment.

**Reader**:
A person who purchases and reads individual premium articles without a publisher account.

**Article**:
An individually identified piece of premium web content offered by a publisher, including corrections and updates under that identity. An article's identity is never reassigned to unrelated content.

**Article offer**:
The publisher's payment terms for access to an article, including the amount, unit, and accepted Cashu mint.

**Article key**:
A reader-controlled key pair derived from the reader's seed for a particular article, used to prove control of the public key associated with access to that article.
_Avoid_: Access token

**Reader seed**:
The reader-held secret from which their article keys can be recreated, separate from their Cashu wallet's seed. Possession of it enables access to purchases made with its derived keys.

**Reader recovery phrase**:
The sequence of words a reader backs up and uses to recreate their reader seed and regain access to purchased articles.

**Reader passkey**:
A reader-controlled credential that recreates a dedicated reader seed. A newly created reader passkey represents a separate reader, rather than an additional way to access an existing reader's purchases.

**Access grant**:
The publisher's non-expiring authorization for a particular public key to repeatedly access a particular article, for as long as the publisher makes that article available.
_Avoid_: Account, subscription
