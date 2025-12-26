import { describe, it, expect } from "vitest";
import { formatPostsToText } from "../src/redditHarvest.js";

describe("formatPostsToText", () => {
  const basePosts = [
    {
      id: "abc123",
      subreddit: "startups",
      title: "How I found my first customers",
      author: "founder123",
      created: "2024-01-15T10:30:00.000Z",
      score: 42,
      numComments: 15,
      url: "https://reddit.com/r/startups/comments/abc123",
      permalink: "/r/startups/comments/abc123/how_i_found_my_first_customers/",
      selftext: "Here's my story about finding customers...",
      comments: []
    }
  ];

  it("should format posts with header", () => {
    const result = formatPostsToText(basePosts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: false,
      commentLimit: 0
    });

    expect(result).toContain("# Reddit corpus export");
    expect(result).toContain("subreddit: r/startups");
    expect(result).toContain("listing: hot");
    expect(result).toContain("postsHarvested: 1");
  });

  it("should include search query in header when provided", () => {
    const result = formatPostsToText(basePosts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: false,
      commentLimit: 0,
      search: "finding customers"
    });

    expect(result).toContain('search: "finding customers"');
    expect(result).not.toContain("listing: hot");
  });

  it("should format post content correctly", () => {
    const result = formatPostsToText(basePosts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: false,
      commentLimit: 0
    });

    expect(result).toContain("POST 1/1");
    expect(result).toContain("id: abc123");
    expect(result).toContain("title: How I found my first customers");
    expect(result).toContain("author: founder123");
    expect(result).toContain("score: 42");
    expect(result).toContain("num_comments: 15");
    expect(result).toContain("Here's my story about finding customers...");
  });

  it("should handle posts with no selftext", () => {
    const posts = [{ ...basePosts[0], selftext: "" }];
    const result = formatPostsToText(posts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: false,
      commentLimit: 0
    });

    expect(result).toContain("(no selftext)");
  });

  it("should format comments when included", () => {
    const posts = [
      {
        ...basePosts[0],
        comments: [
          { id: "c1", author: "user1", score: 10, body: "Great post!" },
          { id: "c2", author: "user2", score: 5, body: "Thanks for sharing" }
        ]
      }
    ];

    const result = formatPostsToText(posts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: true,
      commentLimit: 50
    });

    expect(result).toContain("comments:");
    expect(result).toContain("comment 1:");
    expect(result).toContain("author: user1");
    expect(result).toContain("score: 10");
    expect(result).toContain("Great post!");
    expect(result).toContain("comment 2:");
    expect(result).toContain("Thanks for sharing");
  });

  it("should handle empty comments array", () => {
    const posts = [{ ...basePosts[0], comments: [] }];

    const result = formatPostsToText(posts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: true,
      commentLimit: 50
    });

    expect(result).toContain("comments:\n(none)");
  });

  it("should show comment error when present", () => {
    const posts = [{ ...basePosts[0], commentsError: "Rate limited" }];

    const result = formatPostsToText(posts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: true,
      commentLimit: 50
    });

    expect(result).toContain("comments:\n(error: Rate limited)");
  });

  it("should format multiple posts", () => {
    const posts = [
      { ...basePosts[0], id: "1", title: "First post" },
      { ...basePosts[0], id: "2", title: "Second post" },
      { ...basePosts[0], id: "3", title: "Third post" }
    ];

    const result = formatPostsToText(posts, {
      subreddit: "startups",
      listing: "hot",
      time: "week",
      limit: 25,
      includeComments: false,
      commentLimit: 0
    });

    expect(result).toContain("postsHarvested: 3");
    expect(result).toContain("POST 1/3");
    expect(result).toContain("POST 2/3");
    expect(result).toContain("POST 3/3");
    expect(result).toContain("First post");
    expect(result).toContain("Second post");
    expect(result).toContain("Third post");
  });

  it("should show top listing time range", () => {
    const result = formatPostsToText(basePosts, {
      subreddit: "startups",
      listing: "top",
      time: "month",
      limit: 25,
      includeComments: false,
      commentLimit: 0
    });

    expect(result).toContain("listing: top (month)");
  });
});

