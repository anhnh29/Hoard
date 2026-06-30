export interface FollowStatus {
  isFollowing: boolean;
}

export interface ClapStatus {
  totalClaps: number;
  userClaps: number;
}

export interface CommentItem {
  id: string;
  content: string;
  author: {
    username: string;
    name: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  replies: CommentItem[];
}

export interface BookmarkStatus {
  isBookmarked: boolean;
}
