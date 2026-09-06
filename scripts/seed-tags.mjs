#!/usr/bin/env node
// One-off/idempotent utility: seeds the curated preset tag taxonomy (see
// prisma/schema.prisma's Tag model and the planning doc's section 13).
// Upserts by slug, so re-running after adding more entries below only
// inserts what's new -- safe to run again any time this list grows.
//
// Usage: node scripts/seed-tags.mjs
import { PrismaClient } from "@prisma/client";

const GENRE = "Thể loại";
const TROPE = "Yếu tố";

// Standard Chinese web-novel genre/trope conventions, localized to
// Vietnamese -- a representative, non-exhaustive curated set (see the
// planning doc's section 13: this is seed data to build at
// implementation time, not something to enumerate in the plan itself).
// [name, slug, category]
const TAGS = [
  // Thể loại (genre)
  ["Huyền huyễn", "huyen-huyen", GENRE],
  ["Kỳ huyễn", "ky-huyen", GENRE],
  ["Tiên hiệp", "tien-hiep", GENRE],
  ["Võ hiệp", "vo-hiep", GENRE],
  ["Kiếm hiệp", "kiem-hiep", GENRE],
  ["Đô thị", "do-thi", GENRE],
  ["Ngôn tình", "ngon-tinh", GENRE],
  ["Khoa huyễn", "khoa-huyen", GENRE],
  ["Dị giới", "di-gioi", GENRE],
  ["Đông phương huyễn tưởng", "dong-phuong-huyen-tuong", GENRE],
  ["Tây huyễn", "tay-huyen", GENRE],
  ["Lịch sử", "lich-su", GENRE],
  ["Quân sự", "quan-su", GENRE],
  ["Trò chơi", "tro-choi", GENRE],
  ["Cạnh kỹ", "canh-ky", GENRE],
  ["Đồng nhân", "dong-nhan", GENRE],
  ["Vô hạn lưu", "vo-han-luu", GENRE],
  ["Mạt thế", "mat-the", GENRE],
  ["Dị năng", "di-nang", GENRE],
  ["Linh dị", "linh-di", GENRE],
  ["Kinh dị", "kinh-di", GENRE],
  ["Trinh thám", "trinh-tham", GENRE],
  ["Hài hước", "hai-huoc", GENRE],
  ["Sảng văn", "sang-van", GENRE],
  ["Cung đình", "cung-dinh", GENRE],
  ["Điền văn", "dien-van", GENRE],
  ["Đam mỹ", "dam-my", GENRE],
  ["Bách hợp", "bach-hop", GENRE],
  ["Thiếu nhi", "thieu-nhi", GENRE],
  ["Light Novel", "light-novel", GENRE],

  // Yếu tố (trope/element)
  ["Xuyên không", "xuyen-khong", TROPE],
  ["Trọng sinh", "trong-sinh", TROPE],
  ["Xuyên nhanh", "xuyen-nhanh", TROPE],
  ["Hệ thống", "he-thong", TROPE],
  ["Nữ cường", "nu-cuong", TROPE],
  ["Nam cường", "nam-cuong", TROPE],
  ["Sủng", "sung", TROPE],
  ["Ngọt sủng", "ngot-sung", TROPE],
  ["Ngược", "nguoc", TROPE],
  ["Cung đấu", "cung-dau", TROPE],
  ["Gia đấu", "gia-dau", TROPE],
  ["Hậu cung", "hau-cung", TROPE],
  ["1v1", "1v1", TROPE],
  ["HE", "he", TROPE],
  ["BE", "be", TROPE],
  ["Tu tiên", "tu-tien", TROPE],
  ["Tông môn", "tong-mon", TROPE],
  ["Không gian", "khong-gian", TROPE],
  ["Dưỡng thành", "duong-thanh", TROPE],
  ["Thanh mai trúc mã", "thanh-mai-truc-ma", TROPE],
  ["Báo thù", "bao-thu", TROPE],
  ["Nữ phụ", "nu-phu", TROPE],
  ["Phản diện", "phan-dien", TROPE],
  ["Trưởng thành", "truong-thanh", TROPE],
  ["Chức trường", "chuc-truong", TROPE],
  ["Gia tộc", "gia-toc", TROPE],
  ["Dị thế đại lục", "di-the-dai-luc", TROPE],
  ["Thương nghiệp", "thuong-nghiep", TROPE],
  ["Yêu quái", "yeu-quai", TROPE],
  ["Ngốc manh", "ngoc-manh", TROPE],
  ["Cao lãnh", "cao-lanh", TROPE],
  ["Ngây thơ", "ngay-tho", TROPE],
  ["Thanh xuân", "thanh-xuan", TROPE],
  ["Hôn nhân", "hon-nhan", TROPE],
  ["Nghịch tập", "nghich-tap", TROPE],
  ["Cẩu huyết", "cau-huyet", TROPE],
];

async function main() {
  const prisma = new PrismaClient();
  try {
    let created = 0;
    for (const [name, slug, category] of TAGS) {
      const result = await prisma.tag.upsert({
        where: { slug },
        create: { name, slug, category },
        update: { name, category },
      });
      if (result) created++;
    }
    console.log(`Seeded ${created} tags (${TAGS.length} in list).`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
