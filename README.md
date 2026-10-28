# SHKim의 Note Grove — GitHub Pages 버전

**앱 접속:** https://shkim0824.github.io/note-grove/

**사용 가이드:** https://shkim0824.github.io/note-grove/guide.html

GitHub 저장소에 Markdown으로 보관되는 노션 같은 연구 노트예요. 비공개 노트와 공개 노트를 한 화면에서 쓰고, 페이지마다 🔒 비공개 ↔ 🌐 공개를 바꿀 수 있어요.

## 시작하기

1. 앱 주소를 엽니다. 토큰 없이 열면 공개 페이지만 읽기 전용으로 보여요.
2. 왼쪽 아래 **🔑 GitHub 연결** → fine-grained 토큰을 입력합니다. 토큰은 `ai-notes`, `ai-notes-public` 두 저장소만 선택하고 **Contents: Read and write** 권한을 주세요.
3. **이 브라우저에 토큰 기억하기**를 켜 두면 다음부터 자동으로 연결해요. 노트북마다 한 번씩 입력하면 됩니다.

## 저장소 구성

| 저장소 | 공개 여부 | 용도 |
| --- | --- | --- |
| [shkim0824/note-grove](https://github.com/shkim0824/note-grove) | 공개 | 앱(`index.html`, `guide.html`)과 소스. GitHub Pages로 배포해요. |
| [shkim0824/ai-notes](https://github.com/shkim0824/ai-notes) | 비공개 | 비공개 노트(.md), 첨부 파일, 페이지 목록 `workspace.json` |
| [shkim0824/ai-notes-public](https://github.com/shkim0824/ai-notes-public) | 공개 | 공개 노트(.md), 첨부 파일, 페이지 목록 `workspace.json` |

토큰은 저장소나 HTML에 넣지 않아요. 브라우저에 입력한 토큰으로 GitHub API에 직접 접속해요. 노트 데이터를 이 앱 저장소에 올리지 마세요.

## 기능

- 블록 편집: `/` 메뉴, Markdown 단축키, 드래그로 블록 옮기기, 표·토글·콜아웃·할 일·코드·mermaid 다이어그램, 이미지·PDF 업로드, 속성, 아이콘
- 저장: 자동 저장(1.5초), 고친 블록만 바뀌는 최소 변경 커밋, 오프라인 초안, 다른 기기와의 충돌 처리, 30초마다 동기화
- 공개·비공개: 페이지(와 하위 페이지, 링크한 첨부 파일)를 두 저장소 사이에서 옮기기, 방문자용 읽기 전용 공개 사이트
- GitHub 기능: 커밋 기록 보기와 되돌리기, 휴지통, 템플릿, 레포의 .md 파일 가져오기, Markdown 내려받기

## 개발

```
src/md.js                 Markdown ↔ 블록 변환 (DOM 없음, node에서도 실행)
src/app.js                앱 (GitHub 연동, 편집기, 동기화)
src/index.template.html   화면·스타일
src/guide.html            사용 가이드
build.js                  src → index.html, guide.html (한 파일로 묶음)
```

`node build.js`로 빌드한 뒤 `index.html`, `guide.html`을 main에 커밋하면 GitHub Pages에 배포돼요. 브라우저를 새로고침하면 새 버전을 받아요. 시험 스크립트(Markdown 왕복 시험, GitHub 가짜 서버 + headless Chrome 종단 시험)는 개인 노트를 시험 자료로 쓰기 때문에 이 공개 저장소에는 올리지 않았어요.
