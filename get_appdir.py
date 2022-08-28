import os
from appdirs import user_data_dir
from dotenv import load_dotenv

load_dotenv()

APPNAME = os.getenv("APPNAME")
APPAUTHOR = os.getenv("APPAUTHOR")


def get_appdir():
    return user_data_dir(APPNAME, APPAUTHOR)
