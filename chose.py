from datetime import datetime
import json
import os
import pathlib
import subprocess
import inquirer
from get_appdir import get_appdir
from get_emails.get_emails import get_emails


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

data_dir = get_appdir()
app_dir = pathlib.Path(__file__).parent.absolute()

log_directory = os.path.abspath(
    os.path.join(
        data_dir,
        "output",
        datetime.now().strftime("%Y-%m-%d-%H-%M-%S") + "-" + selected["email"],
    )
)
os.makedirs(log_directory)

with open(os.path.join(data_dir, "communicate.json"), "w") as f:
    json.dump({"email": selected["email"], "log_directory": log_directory}, f)


cmd = f"cd {app_dir} && npm run go"
# start command in foreground and store output in variable
process = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

if process.stdout is None:
    print("No output")
    exit(1)

output_file_path = os.path.join(log_directory, "output.txt")

for line in process.stdout:
    line_str = line.decode("utf-8")
    print(line_str)
    with open(output_file_path, "a") as f:
        f.write(line_str)

process.wait()
