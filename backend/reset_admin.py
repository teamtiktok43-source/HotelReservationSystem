import asyncio
import getpass

import bcrypt
from sqlalchemy import select

from database import AsyncSessionLocal
from models import User


async def main():
    print("=== Reset Admin Password ===")

    username = input("Username: ").strip()

    if not username:
        print("Username cannot be empty.")
        return

    new_password = getpass.getpass("New password: ")

    if not new_password:
        print("Password cannot be empty.")
        return

    confirm_password = getpass.getpass("Confirm password: ")

    if new_password != confirm_password:
        print("Passwords do not match.")
        return

    async with AsyncSessionLocal() as session:

        result = await session.execute(
            select(User).where(
                User.username == username
            )
        )

        user = result.scalar_one_or_none()

        if not user:
            print("User not found.")
            return

        password_hash = bcrypt.hashpw(
            new_password.encode("utf-8"),
            bcrypt.gensalt()
        ).decode("utf-8")

        user.password_hash = password_hash

        # Make sure the account is active.
        user.is_active = True

        await session.commit()

        print()
        print("Password reset successfully!")
        print(f"Username: {user.username}")
        print(f"Role: {user.role}")
        print(f"Active: {user.is_active}")


if __name__ == "__main__":
    asyncio.run(main())