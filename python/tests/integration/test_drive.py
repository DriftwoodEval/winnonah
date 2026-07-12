"""Integration tests against a real, dedicated Google Drive sandbox folder.

Skipped by default; run explicitly with `mise run test:python:integration`
(or `uv run pytest --run-integration -m integration`).

TEST_FOLDER_ID is a folder set aside specifically for these tests - safe to
create, rename, move, and delete files/folders inside it freely. Never point
this at a real production folder.
"""

import pytest
from googleapiclient.discovery import build
from googleapiclient.http import MediaInMemoryUpload

from utils.google import (
    batch_move_files,
    check_for_subfolders,
    copy_file,
    create_folder_in_folder,
    get_file_as_bytes,
    get_files_by_name,
    get_items_in_folder,
    google_authenticate,
    list_files_in_folder,
    list_subfolders,
    move_file,
)

TEST_FOLDER_ID = "1oskntPljoZ02LhISUt1cMiE005zsdtxC"

_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"
_GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"


def _drive_service():
    return build("drive", "v3", credentials=google_authenticate())


def _create_file(
    name: str, parent_id: str, content: bytes = b"test", mime_type: str = "text/plain"
) -> dict:
    media = MediaInMemoryUpload(content, mimetype=mime_type)
    return (
        _drive_service()
        .files()
        .create(
            body={"name": name, "parents": [parent_id]},
            media_body=media,
            fields="id, name, mimeType",
        )
        .execute()
    )


def _create_folder(name: str, parent_id: str) -> str:
    folder = (
        _drive_service()
        .files()
        .create(
            body={
                "name": name,
                "mimeType": _GOOGLE_FOLDER_MIME,
                "parents": [parent_id],
            },
            fields="id",
        )
        .execute()
    )
    return folder["id"]


@pytest.fixture
def sandbox_folder():
    """Creates a throwaway subfolder inside TEST_FOLDER_ID and deletes it (and
    its contents) afterwards, so each test gets a clean, isolated space."""
    folder_id = _create_folder("pytest-sandbox", TEST_FOLDER_ID)
    yield folder_id
    _drive_service().files().delete(fileId=folder_id).execute()


@pytest.mark.integration
class TestCreateFolderInFolder:
    def test_creates_a_folder_visible_in_parent(self, sandbox_folder):
        create_folder_in_folder("child folder", sandbox_folder)
        items = get_items_in_folder(sandbox_folder)
        assert items is not None
        assert [item["name"] for item in items] == ["child folder"]


@pytest.mark.integration
class TestGetItemsInFolder:
    def test_returns_files_and_folders(self, sandbox_folder):
        _create_file("a file.txt", sandbox_folder)
        create_folder_in_folder("a folder", sandbox_folder)
        items = get_items_in_folder(sandbox_folder)
        assert items is not None
        names = {item["name"] for item in items}
        assert names == {"a file.txt", "a folder"}


@pytest.mark.integration
class TestListFilesInFolder:
    def test_excludes_folders(self, sandbox_folder):
        _create_file("a file.txt", sandbox_folder)
        create_folder_in_folder("a folder", sandbox_folder)
        names = {item["name"] for item in list_files_in_folder(sandbox_folder)}
        assert names == {"a file.txt"}


@pytest.mark.integration
class TestListSubfolders:
    def test_excludes_files(self, sandbox_folder):
        _create_file("a file.txt", sandbox_folder)
        create_folder_in_folder("a folder", sandbox_folder)
        names = {item["name"] for item in list_subfolders(sandbox_folder)}
        assert names == {"a folder"}


@pytest.mark.integration
class TestCheckForSubfolders:
    def test_returns_empty_for_empty_folder(self, sandbox_folder):
        assert check_for_subfolders(sandbox_folder) == "empty"

    def test_returns_only_files_when_no_subfolders(self, sandbox_folder):
        _create_file("a file.txt", sandbox_folder)
        assert check_for_subfolders(sandbox_folder) == "only files"

    def test_returns_subfolders_when_any_exist(self, sandbox_folder):
        create_folder_in_folder("a folder", sandbox_folder)
        _create_file("a file.txt", sandbox_folder)
        assert check_for_subfolders(sandbox_folder) == "subfolders"


@pytest.mark.integration
class TestGetFilesByName:
    def test_matches_exact_name(self, sandbox_folder):
        _create_file("match.txt", sandbox_folder)
        _create_file("no-match.txt", sandbox_folder)
        results = get_files_by_name(sandbox_folder, "match.txt")
        assert [f["name"] for f in results] == ["match.txt"]

    def test_returns_empty_list_when_no_match(self, sandbox_folder):
        assert get_files_by_name(sandbox_folder, "nonexistent.txt") == []


@pytest.mark.integration
class TestCopyFile:
    def test_copies_into_destination_with_new_name(self, sandbox_folder):
        original = _create_file("original.txt", sandbox_folder, content=b"hello")
        dest_id = _create_folder("dest", sandbox_folder)

        copy_file(original["id"], "copy.txt", dest_id)

        assert [f["name"] for f in list_files_in_folder(dest_id)] == ["copy.txt"]
        # The original is untouched.
        assert [f["name"] for f in list_files_in_folder(sandbox_folder)] == [
            "original.txt"
        ]


@pytest.mark.integration
class TestMoveFile:
    def test_moves_file_between_folders(self, sandbox_folder):
        src_id = _create_folder("src", sandbox_folder)
        dest_id = _create_folder("dest", sandbox_folder)
        file = _create_file("movable.txt", src_id)

        move_file(file["id"], dest_id)

        assert list_files_in_folder(src_id) == []
        assert [f["name"] for f in list_files_in_folder(dest_id)] == ["movable.txt"]


@pytest.mark.integration
class TestBatchMoveFiles:
    def test_moves_all_given_files(self, sandbox_folder):
        src_id = _create_folder("src", sandbox_folder)
        dest_id = _create_folder("dest", sandbox_folder)
        file_a = _create_file("a.txt", src_id)
        file_b = _create_file("b.txt", src_id)

        batch_move_files([file_a["id"], file_b["id"]], dest_id, src_id)

        assert list_files_in_folder(src_id) == []
        moved_names = {f["name"] for f in list_files_in_folder(dest_id)}
        assert moved_names == {"a.txt", "b.txt"}


@pytest.mark.integration
class TestGetFileAsBytes:
    def test_downloads_plain_file_contents(self, sandbox_folder):
        file = _create_file("plain.txt", sandbox_folder, content=b"hello world")
        assert get_file_as_bytes(file) == b"hello world"

    def test_exports_google_doc_as_pdf(self, sandbox_folder):
        doc = (
            _drive_service()
            .files()
            .create(
                body={
                    "name": "a doc",
                    "mimeType": _GOOGLE_DOC_MIME,
                    "parents": [sandbox_folder],
                },
                fields="id, name, mimeType",
            )
            .execute()
        )
        assert get_file_as_bytes(doc).startswith(b"%PDF")
