export default {
  layout: "post.njk",
  navActive: "blog",
  tags: ["posts"],
  eleventyComputed: {
    permalink: (data) => {
      // Use the full source filename (including any date prefix) as the slug
      // so posts that share a slug — e.g. multiple "weekly-recap" entries —
      // stay unique. Eleventy strips date prefixes from `fileSlug` and
      // `filePathStem`, so derive directly from `inputPath`.
      const base = data.page.inputPath.split("/").pop().replace(/\.md$/, "");
      return `/blog/${base}/`;
    },
  },
};
