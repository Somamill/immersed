# Repository discovery

The README describes Japanese immersion for iPhone, YouTube subtitle lookup, open-source dictionaries and the relation to Migaku / Language Reactor. These descriptions match the prototype's current scope; they are not promises of search-engine ranking or feature parity.

The GitHub connection used for v0.5.17 can push code and releases but returned `403 Resource not accessible by integration` for both repository-description and topic updates. The reviewed values are saved in [repository-metadata.json](repository-metadata.json).

An owner can apply them from the repository's **About → gear icon**, or with an appropriately permitted `gh` session:

```sh
gh repo edit Somamill/immersed --description "$(node -p 'require("./docs/repository-metadata.json").description')"
gh repo edit Somamill/immersed --add-topic "$(node -p 'require("./docs/repository-metadata.json").topics.join(",")')"
```

Use [the current app screenshots](images/) for previews. Their study media/captions are illustrative and labelled, rather than a live transcription demonstration. The repository's top-level license covers app code; data and model credits stay in THIRD_PARTY.md.
