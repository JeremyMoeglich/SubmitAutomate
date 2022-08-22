from dataclasses import dataclass
import os
import easyimap
from dotenv import load_dotenv

load_dotenv()

IMAP_HOST = os.getenv("IMAP_HOST")
IMAP_USERNAME = os.getenv("IMAP_USERNAME")
IMAP_PASSWORD = os.getenv("IMAP_PASSWORD")

@dataclass
class Email:
    title: str
    body: str


def get_emails():
    imapper = easyimap.connect(IMAP_HOST, IMAP_USERNAME, IMAP_PASSWORD, "INBOX", read_only=True)
    emails = imapper.listup(20)
    return [Email(str(email.title), str(email.body)) for email in emails]

