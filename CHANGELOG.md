# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [Unreleased]


### Features

* **business-units:** add per-unit menu management (public cursor-paginated menu listing, public single-item read, internal management view, add/update/deactivate use cases, required custom pricing via Money VO)
* **identity:** add self-service password change endpoint (re-verifies current password, strong-password validation, revokes all active refresh tokens)
* **identity:** add refresh token rotation with reuse detection and logout
* **identity:** add user reactivation endpoint (ADMIN/MANAGER) and self-update endpoint (authenticated users can edit their own name/phone)


## [1.2.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.0.0...v1.2.0) (2026-06-22)


### Features

* **business-units:** add BusinessUnit entity with CRUD and public endpoints ([086f555](https://github.com/M4rcosz/raizes-do-nordeste/commit/086f555a61c8e1bd91be2fecf9eea10ba2f3c36c))
* **identity:** add user creation and deactivation ([b84dfb2](https://github.com/M4rcosz/raizes-do-nordeste/commit/b84dfb29db03faa830185fe33190932f1de19e5e))

## [1.1.0](https://github.com/M4rcosz/raizes-do-nordeste/compare/v1.0.0...v1.1.0) (2026-06-21)


### Features

* **identity:** add user creation and deactivation ([b84dfb2](https://github.com/M4rcosz/raizes-do-nordeste/commit/b84dfb29db03faa830185fe33190932f1de19e5e))
