from dataclasses import dataclass
import imaplib
import os
import easyimap
from dotenv import load_dotenv

load_dotenv()

IMAP_HOST = os.getenv("IMAP_HOST")
IMAP_USERNAME = os.getenv("IMAP_USERNAME")
IMAP_PASSWORD = os.getenv("IMAP_PASSWORD")

if IMAP_HOST is None or IMAP_USERNAME is None or IMAP_PASSWORD is None:
    print("Please set IMAP_HOST, IMAP_USERNAME and IMAP_PASSWORD in .env")
    exit(1)


@dataclass
class Email:
    title: str
    body: str


def get_emails():
    imapper = easyimap.connect(
        IMAP_HOST, IMAP_USERNAME, IMAP_PASSWORD, 'INBOX', read_only=True
    )
    total = 10
    emails = imapper.listup(total, 'FROM "Sky Abodaten Eingang"')
    #if len(emails) < total:
    #    imapper.change_mailbox('"Sky Aboformulare"')
    #    emails += imapper.listup(total - len(emails), 'FROM "Sky Abodaten Eingang"')
    return [Email(str(email.title), str(email.body)) for email in emails]

