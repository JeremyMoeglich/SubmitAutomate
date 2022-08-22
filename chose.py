import json
import os
import inquirer
from get_emails.get_emails import get_emails
import pathlib


def get_email_from_body(body):
    lines = body.split("\n")
    for line in lines:
        if line.startswith("Ihre E-Mail-Adresse	"):
            return line.split("	")[1].strip()


emails = [
    get_email_from_body(v.body) for v in get_emails() if get_email_from_body(v.body)
]

selected = inquirer.prompt(
    [inquirer.List("email", message="Select an email", choices=emails)]
)

if selected is None:
    print("No email selected")
    exit(1)

dir_path = pathlib.Path(__file__).parent.absolute()

json.dump(selected, open(os.path.join(dir_path, "selected.json"), "w"))
os.system(f"cd {dir_path} && npm run go")
